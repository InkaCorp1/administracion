/**
 * Módulo de Créditos - Versión Móvil Modular
 */

let liteCreditosData = [];

async function initCreditosModule() {
    await fetchLiteCreditos();
    
    // Exponer funciones necesarias al scope global para los onclick de los templates
    window.showLiteCreditDetails = showLiteCreditDetails;
    window.showCreditoAmortization = showCreditoAmortization;
    window.handleQuickCreditPayment = handleQuickCreditPayment;
    window.closeAmortizationLite = () => {
        if (typeof closeLiteModal === 'function') closeLiteModal('modal-amortizacion-credito');
    };
    window.filterLiteCreditos = filterLiteCreditos;
    window.closeLiteSearch = closeLiteSearch;
}

async function fetchLiteCreditos() {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos')
            .select(`
                id_credito, 
                codigo_credito, 
                capital, 
                estado_credito, 
                fecha_desembolso,
                fecha_primer_pago,
                plazo,
                cuotas_pagadas,
                cuota_con_ahorro,
                socio:ic_socios!id_socio (
                    nombre,
                    cedula,
                    whatsapp
                )
            `)
            .order('fecha_desembolso', { ascending: false });

        if (error) throw error;

        // Lógica de Ordenamiento Priorizado (Igual que PC)
        const estadoPriority = {
            'MOROSO': 1,
            'ACTIVO': 2,
            'PAUSADO': 3,
            'PRECANCELADO': 4,
            'CANCELADO': 5,
            'PENDIENTE': 6
        };

        const sortedData = data.sort((a, b) => {
            const aEstadoPrio = estadoPriority[a.estado_credito] || 99;
            const bEstadoPrio = estadoPriority[b.estado_credito] || 99;
            if (aEstadoPrio !== bEstadoPrio) return aEstadoPrio - bEstadoPrio;

            const getNextPayment = (c) => {
                if (!c.fecha_primer_pago) return new Date(8640000000000000);
                const baseDate = window.parseDate(c.fecha_primer_pago);
                if (!baseDate) return new Date(8640000000000000);
                baseDate.setMonth(baseDate.getMonth() + (c.cuotas_pagadas || 0));
                return baseDate;
            };

            return getNextPayment(a) - getNextPayment(b);
        });

        liteCreditosData = sortedData;
        renderLiteCreditos(sortedData);

        // Sincronizar estados morosos automáticamente en segundo plano para no bloquear UI
        sincronizarEstadosMorososLite(liteCreditosData).catch(e => console.error('[Sync Error]', e));

    } catch (error) {
        console.error('Error fetching lite creditos:', error);
        const list = document.getElementById('lite-creditos-list');
        if (list) list.innerHTML = '<p style="text-align:center; padding: 2rem;">Error al cargar créditos.</p>';
    }
}

function renderLiteCreditos(creditos) {
    const container = document.getElementById('lite-creditos-list');
    if (!container) return;
    
    if (!creditos || creditos.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding: 2rem; color: var(--text-muted);">No se encontraron créditos.</p>';
        return;
    }

    const grouped = {};
    const statesOrder = ['MOROSO', 'ACTIVO', 'PAUSADO', 'PRECANCELADO', 'CANCELADO', 'PENDIENTE'];
    
    creditos.forEach(c => {
        const estado = c.estado_credito || 'PENDIENTE';
        if (!grouped[estado]) grouped[estado] = [];
        grouped[estado].push(c);
    });

    const estadoConfig = {
        'ACTIVO': { icon: 'fa-check-circle', color: '#10B981', label: 'ACTIVOS', bgColor: 'rgba(16, 185, 129, 0.15)' },
        'MOROSO': { icon: 'fa-exclamation-triangle', color: '#EF4444', label: 'EN MORA', bgColor: 'rgba(239, 68, 68, 0.15)' },
        'PAUSADO': { icon: 'fa-pause-circle', color: '#F59E0B', label: 'PAUSADOS', bgColor: 'rgba(245, 158, 11, 0.15)' },
        'PRECANCELADO': { icon: 'fa-calendar-check', color: '#3B82F6', label: 'PRECANCELADOS', bgColor: 'rgba(59, 130, 246, 0.15)' },
        'CANCELADO': { icon: 'fa-flag-checkered', color: '#6B7280', label: 'CANCELADOS', bgColor: 'rgba(107, 114, 128, 0.15)' },
        'PENDIENTE': { icon: 'fa-clock', color: '#8B5CF6', label: 'PENDIENTES', bgColor: 'rgba(139, 92, 246, 0.15)' }
    };

    let html = '';
    
    statesOrder.forEach(estado => {
        const list = grouped[estado];
        if (list && list.length > 0) {
            const config = estadoConfig[estado] || { icon: 'fa-folder', color: '#9CA3AF', label: estado, bgColor: 'rgba(156, 163, 175, 0.15)' };
            
            const listHtml = list.map(c => {
                let statusLabel = c.estado_credito;
                if (c.estado_credito === 'MOROSO' && c.fecha_primer_pago) {
                    const nextDate = window.parseDate(c.fecha_primer_pago);
                    if (nextDate) {
                        nextDate.setMonth(nextDate.getMonth() + (c.cuotas_pagadas || 0));
                        const hoy = new Date();
                        hoy.setHours(0, 5, 0, 0); // Margen para evitar desfases
                        if (nextDate < hoy) {
                            const diffTime = hoy - nextDate;
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                            statusLabel = `MOROSO - ${diffDays} DÍAS VENCIDO`;
                        }
                    }
                }

                return `
                <div class="lite-credit-card" onclick="showLiteCreditDetails('${c.id_credito}')">
                    <div class="lite-credit-header">
                        <div class="lite-credit-code">
                            <i class="fas fa-file-invoice-dollar" style="color: var(--gold);"></i>
                            <span>${c.codigo_credito}</span>
                        </div>
                        <div style="text-align: right;">
                            <div class="lite-credit-amount">$${parseFloat(c.capital).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</div>
                            <div style="font-size: 0.85rem; color: var(--success); font-weight: 700;">
                                <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 400;">Cuota:</span> 
                                $${parseFloat(c.cuota_con_ahorro || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    </div>
                    <div style="margin-bottom: 0.5rem;">
                        <div style="font-weight: 700; color: var(--text-primary); font-size: 0.9rem;">${c.socio?.nombre || 'Socio No Encontrado'}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">${c.socio?.cedula || '---'}</div>
                    </div>
                    <div class="lite-credit-status" style="justify-content: space-between; width: 100%;">
                         <span class="lite-status-badge badge-${c.estado_credito?.toLowerCase()}">${statusLabel}</span>
                         <button class="lite-btn-pay-inline" onclick="event.stopPropagation(); window.handleQuickCreditPayment('${c.id_credito}', this)">
                            <i class="fas fa-dollar-sign"></i> Pagar
                         </button>
                    </div>
                    <div class="lite-credit-footer">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fas fa-calendar-alt"></i>
                            <span>${c.fecha_desembolso ? window.formatDate(c.fecha_desembolso) : 'N/A'}</span>
                        </div>
                        <div style="margin-left: auto; font-weight: 700; color: #10B981;">
                            <i class="fas fa-layer-group" style="font-size: 0.7rem; opacity: 0.8;"></i>
                            ${c.cuotas_pagadas || 0}/${c.plazo || 0}
                        </div>
                    </div>
                </div>
            `}).join('');

            html += `
                <div class="lite-status-group" data-estado="${estado}">
                    <div class="lite-section-header" style="--section-color: ${config.color}; --section-bg: ${config.bgColor};">
                        <div class="lite-header-info">
                            <i class="fas ${config.icon}"></i>
                            <span class="title">${config.label}</span>
                            <span class="count">${list.length}</span>
                        </div>
                        <button class="lite-search-trigger" onclick="toggleLiteSearch(event, this)">
                            <i class="fas fa-search"></i>
                        </button>
                        <div class="lite-header-search-box">
                            <input type="text" placeholder="Buscar en todos..." 
                                   oninput="filterLiteCreditos(this.value)"
                                   onfocus="this.select()">
                            <button class="lite-search-close" onclick="closeLiteSearch(event, this)">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                    <div class="lite-cards-container">
                        ${listHtml}
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;

    // Configurar Observer para detectar cuando el header se queda "pegado" (sticky)
    // Esto permite mostrar la lupa solo cuando está en el tope
    const scrollContainer = document.querySelector('.main-content');
    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach(entry => {
                // Al estar a top: 0px y usar rootMargin -1px, si el header está en el tope (y=0),
                // su ratio será < 1 porque 1px quedará fuera del área de observación.
                // Esto hace que la lupa aparezca por defecto sin scrollear.
                const isAtTop = entry.boundingClientRect.top <= (entry.rootBounds?.top || 0) + 10;
                const isStuck = isAtTop && entry.intersectionRatio < 1;
                
                if (entry.target.classList.contains('is-stuck') !== isStuck) {
                    entry.target.classList.toggle('is-stuck', isStuck);
                }
            });
        },
        { 
            root: scrollContainer,
            threshold: [1.0],
            rootMargin: '-1px 0px 0px 0px' 
        }
    );

    document.querySelectorAll('.lite-section-header').forEach(header => {
        observer.observe(header);
    });
}

function filterLiteCreditos(term) {
    const search = term.toLowerCase();
    const activeSearchHeader = document.querySelector('.lite-section-header.searching');
    const activeGroup = activeSearchHeader?.closest('.lite-status-group');
    
    // Búsqueda global (se aplica a todos los grupos)
    document.querySelectorAll('.lite-status-group').forEach(group => {
        let hasVisibleCards = false;
        
        group.querySelectorAll('.lite-credit-card').forEach(card => {
            const text = card.textContent.toLowerCase();
            const matches = search.length === 0 || text.includes(search);
            card.style.display = matches ? 'block' : 'none';
            if (matches) hasVisibleCards = true;
        });

        // Visibilidad del Grupo: 
        // Si hay búsqueda: mostrar solo si tiene coincidencias (o es el grupo del buscador)
        // Si NO hay búsqueda: pero el buscador está abierto, mostrar todos los grupos
        if (activeSearchHeader) {
            if (search.length === 0) {
                group.style.display = 'block';
            } else {
                group.style.display = (hasVisibleCards || group === activeGroup) ? 'block' : 'none';
            }
        } else {
            // Estado normal (sin buscador)
            group.style.display = 'block';
        }

        // Visibilidad del Header:
        // Si el buscador está abierto, solo se muestra el header del buscador activo
        const header = group.querySelector('.lite-section-header');
        if (activeSearchHeader) {
            header.style.display = (header === activeSearchHeader) ? 'flex' : 'none';
        } else {
            header.style.display = 'flex';
        }
    });
}

function toggleLiteSearch(event, btn) {
    event.stopPropagation();
    const header = btn.closest('.lite-section-header');
    const scrollContainer = document.querySelector('.main-content');
    
    // Modo Inmersivo de BÃºsqueda
    document.body.classList.add('searching-mode');
    header.classList.add('searching');
    if (scrollContainer) {
        scrollContainer.classList.add('searching-active');
        scrollContainer.scrollTop = 0; // Volvemos al inicio para ver resultados desde arriba
    }
    
    filterLiteCreditos('');

    const input = header.querySelector('input');
    setTimeout(() => input.focus(), 100);
}

function closeLiteSearch(event, btn) {
    event.stopPropagation();
    const header = btn.closest('.lite-section-header');
    const scrollContainer = document.querySelector('.main-content');

    document.body.classList.remove('searching-mode');
    header.classList.remove('searching');
    if (scrollContainer) scrollContainer.classList.remove('searching-active');
    
    // Restauramos visibilidad completa
    document.querySelectorAll('.lite-status-group').forEach(g => {
        g.style.display = 'block';
        g.querySelector('.lite-section-header').style.display = 'flex';
        g.querySelectorAll('.lite-credit-card').forEach(card => card.style.display = 'block');
    });

    const input = header.querySelector('input');
    input.value = '';
    filterLiteCreditos('');
}

async function showLiteCreditDetails(id) {
    const c = liteCreditosData.find(item => item.id_credito === id);
    if (!c) return;

    document.getElementById('lite-det-codigo').textContent = c.codigo_credito;
    document.getElementById('lite-det-socio').textContent = c.socio?.nombre || 'Socio No Encontrado';

    const cuotasPagadas = c.cuotas_pagadas || 0;
    const plazo = c.plazo || 1;
    const pct = Math.round((cuotasPagadas / plazo) * 100);

    document.getElementById('lite-det-cuotas').textContent = `${cuotasPagadas}/${plazo} cuotas`;
    document.getElementById('lite-det-pct').textContent = `${pct}%`;
    document.getElementById('lite-progreso-bar').style.width = `${pct}%`;

    document.getElementById('lite-det-cuota').textContent = `$${parseFloat(c.cuota_con_ahorro || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
    document.getElementById('lite-det-capital').textContent = `$${parseFloat(c.capital || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;

    const estadoEl = document.getElementById('lite-det-estado');
    if (estadoEl) {
        let statusLabel = c.estado_credito;
        if (c.estado_credito === 'MOROSO' && c.fecha_primer_pago) {
            const nextDate = window.parseDate(c.fecha_primer_pago);
            if (nextDate) {
                nextDate.setMonth(nextDate.getMonth() + (c.cuotas_pagadas || 0));
                const hoy = new Date();
                hoy.setHours(0, 5, 0, 0); 
                if (nextDate < hoy) {
                    const diffTime = hoy - nextDate;
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    statusLabel = `MOROSO - ${diffDays} DÍAS VENCIDO`;
                }
            }
        }
        estadoEl.textContent = statusLabel;
        estadoEl.className = `lite-det-status badge-${c.estado_credito?.toLowerCase()}`;
    }

    // Sección de Deuda Mora
    const moraSection = document.getElementById('lite-det-mora-section');
    if (moraSection) {
        if (c.estado_credito === 'MOROSO') {
            moraSection.style.display = 'block';
            document.getElementById('lite-det-mora-cuotas').textContent = 'Calculando...';
            document.getElementById('lite-det-mora-valor').textContent = '$0.00';
            document.getElementById('lite-det-mora-total').textContent = '$0.00';

            try {
                const supabase = window.getSupabaseClient();
                const { data: cuotas, error } = await supabase
                    .from('ic_creditos_amortizacion')
                    .select('*')
                    .eq('id_credito', c.id_credito)
                    .neq('estado_cuota', 'PAGADO')
                    .neq('estado_cuota', 'CONDONADO');

                if (!error && cuotas) {
                    const hoyStr = typeof getEcuadorDateString === 'function' ? getEcuadorDateString() : new Date().toISOString().split('T')[0];
                    const hoy = window.parseDate(hoyStr);
                    if (hoy) hoy.setHours(23, 59, 59, 999);

                    let netoVencido = 0;
                    let moraAcumulada = 0;

                    cuotas.forEach(cuota => {
                        const vencimento = window.parseDate(cuota.fecha_vencimiento);
                        if (vencimento && vencimento <= hoy) {
                            netoVencido += parseFloat(cuota.cuota_total || 0);
                            const moraInfo = calcularMoraLite(cuota.fecha_vencimiento, hoyStr);
                            if (moraInfo.estaEnMora) {
                                moraAcumulada += moraInfo.montoMora;
                            }
                        }
                    });

                    document.getElementById('lite-det-mora-cuotas').textContent = `$${netoVencido.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
                    document.getElementById('lite-det-mora-valor').textContent = `$${moraAcumulada.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
                    document.getElementById('lite-det-mora-total').textContent = `$${(netoVencido + moraAcumulada).toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
                }
            } catch (err) {
                console.error('Error calculando deuda mora lite:', err);
                moraSection.style.display = 'none';
            }
        } else {
            moraSection.style.display = 'none';
        }
    }

    // Nuevos campos
    const fechaDes = c.fecha_desembolso ? window.formatDate(c.fecha_desembolso, { month: 'long' }) : '---';
    document.getElementById('lite-det-fecha-val').textContent = fechaDes;

    // Calcular próximo vencimiento
    if (c.fecha_primer_pago) {
        const nextDate = window.parseDate(c.fecha_primer_pago);
        if (nextDate) {
            nextDate.setMonth(nextDate.getMonth() + (c.cuotas_pagadas || 0));
            document.getElementById('lite-det-vencimiento').textContent = window.formatDate(nextDate, { month: 'long' });
        } else {
            document.getElementById('lite-det-vencimiento').textContent = 'Error';
        }
    } else {
        document.getElementById('lite-det-vencimiento').textContent = 'No definido';
    }

    // Botón WhatsApp (Especial para Morosos)
    const btnWhatsapp = document.getElementById('btn-whatsapp-socio');
    if (btnWhatsapp) {
        if (c.estado_credito === 'MOROSO' && c.socio?.whatsapp) {
            btnWhatsapp.style.display = 'flex';
            btnWhatsapp.onclick = () => {
                // Cálculo de días de mora
                const nextDate = window.parseDate(c.fecha_primer_pago);
                if (!nextDate) return;
                
                nextDate.setMonth(nextDate.getMonth() + (c.cuotas_pagadas || 0));
                const today = new Date();
                const diffTime = Math.abs(today - nextDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                let persuasividad = "";
                if (diffDays <= 5) {
                    persuasividad = "un pequeño retraso";
                } else if (diffDays <= 10) {
                    persuasividad = "un retraso considerable";
                } else {
                    persuasividad = "un retraso crítico";
                }

                const msg = encodeURIComponent(
                    `*INKA CORP - NOTIFICACIÓN DE PAGO*\n\n` +
                    `Hola *${c.socio.nombre}*, esperamos que te encuentres bien.\n\n` +
                    `Te escribimos para informarte que tu crédito *${c.codigo_credito}* presenta ${persuasividad} de *${diffDays} días* (vencía el ${window.formatDate(nextDate)}).\n\n` +
                    `Entendemos que pueden surgir imprevistos, por lo que te invitamos a cancelar tu cuota de *$${parseFloat(c.cuota_con_ahorro).toFixed(2)}* lo antes posible para evitar recargos adicionales por mora.\n\n` +
                    `Agradecemos de antemano tu compromiso para ponerte al día y mantener tu historial impecable.\n\n` +
                    `¿A qué hora podrías realizar el depósito hoy?`
                );
                const phone = String(c.socio.whatsapp).replace(/\D/g, '');
                window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
            };
        } else {
            btnWhatsapp.style.display = 'none';
        }
    }

    document.getElementById('lite-det-fecha').textContent = `Desembolso: ${c.fecha_desembolso ? window.formatDate(c.fecha_desembolso) : '--/--/----'}`;

    // Botón Pagar en Modal
    const btnPagar = document.getElementById('btn-pagar-credito');
    if (btnPagar) {
        if (c.estado_credito !== 'CANCELADO') {
            btnPagar.style.display = 'flex';
            btnPagar.onclick = () => window.handleQuickCreditPayment(id, btnPagar);
        } else {
            btnPagar.style.display = 'none';
        }
    }

    window.currentCreditoId = id;
    if (typeof openLiteModal === 'function') openLiteModal('credito-lite-modal');
}

let currentPaymentCuotas = []; 
let currentSelectedReceiptFile = null;

/**
 * Abre el modal de pago completo para móvil
 */
window.openPaymentModalMobile = async function(detalleId, btn) {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction()) return;
    }

    if (btn) btn.classList.add('btn-loading');
    
    try {
        const supabase = window.getSupabaseClient();
        const id = window.currentCreditoId;
        const c = liteCreditosData.find(item => item.id_credito === id);
        if (!c) return;

        // Cargar cuota inicial
        const { data: cuota, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_detalle', detalleId)
            .single();

        if (error) throw error;

        // Obtener consecutivas
        currentPaymentCuotas = await getConsecutiveUnpaidInstallmentsLite(id, detalleId);

        // Llenar datos básicos
        document.getElementById('pago-lite-credito-codigo').textContent = `COD: ${c.codigo_credito}`;
        document.getElementById('pago-lite-socio-nombre').textContent = c.socio?.nombre || 'Socio';
        
        const hoy = new Date();
        hoy.setHours(23, 59, 59, 999);

        // Poblar Seleccionador Personalizado (Grid de Cards)
        const select = document.getElementById('pago-lite-cuotas-select');
        const customContainer = document.getElementById('pago-lite-cuotas-selection-list');
        
        // Reset 
        select.innerHTML = '';
        customContainer.innerHTML = '';

        currentPaymentCuotas.forEach((cuota, idx) => {
            const count = idx + 1;
            const endNum = cuota.numero_cuota;
            const total = currentPaymentCuotas.slice(0, count).reduce((sum, item) => sum + parseFloat(item.cuota_total), 0);
            
            const venc = window.parseDate(cuota.fecha_vencimiento);
            const fechaLabel = venc ? window.formatDate(venc) : 'S/F';
            const isVencida = venc && venc <= hoy;

            // 1. Sincronizar select oculto (Compatibility)
            const option = document.createElement('option');
            option.value = count;
            option.textContent = `${count} ${count === 1 ? 'Cuota' : 'Cuotas'}`;
            select.appendChild(option);

            // 2. Crear Card Personalizada
            const card = document.createElement('div');
            card.className = `lite-selection-card ${isVencida ? 'selection-atrasada-bg' : ''} ${idx === 0 ? 'selected' : ''}`;
            card.setAttribute('data-value', count);
            
            card.innerHTML = `
                <div class="lite-selection-card-info">
                    <span class="lite-selection-card-title">
                        ${count} ${count === 1 ? 'Cuota' : 'Cuotas'} (Hasta #${endNum})
                    </span>
                    <span class="lite-selection-card-subtitle ${isVencida ? 'selection-atrasada' : ''}">
                        <i class="fas fa-calendar-day"></i> 
                        ${fechaLabel} ${isVencida ? '(ATRASADA)' : ''}
                    </span>
                </div>
                <div class="lite-selection-card-value">$${total.toFixed(2)}</div>
            `;

            card.onclick = () => selectCard(count);
            customContainer.appendChild(card);
        });

        function selectCard(val) {
            // UI Update
            const cards = customContainer.querySelectorAll('.lite-selection-card');
            cards.forEach(c => c.classList.toggle('selected', parseInt(c.getAttribute('data-value')) === val));
            
            // Sync Hidden Select
            select.value = val;
            
            // Trigger Original Re-calculation logic
            updateMoraYTotalLite();
        }

        // Reset inputs
        const fechaInput = document.getElementById('pago-lite-fecha');
        // Fecha actual en formato YYYY-MM-DD local
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        fechaInput.value = `${year}-${month}-${day}`;
        
        document.getElementById('pago-lite-referencia').value = '';
        const refInput = document.getElementById('pago-lite-referencia');
        if (refInput) {
            refInput.readOnly = false;
            refInput.style.background = "";
        }
        window.clearLiteReceipt();

        // Handlers
        select.onchange = updateMoraYTotalLite;
        fechaInput.onchange = updateMoraYTotalLite;
        
        const montoInput = document.getElementById('pago-lite-monto-personalizado');
        montoInput.oninput = updateMoraYTotalLite;
        montoInput.onblur = () => {
            const isConvenio = document.getElementById('pago-lite-convenio-toggle').checked;
            if (isConvenio) {
                const count = parseInt(select.value) || 1;
                const cuotasSeleccionadas = currentPaymentCuotas.slice(0, count);
                const montoBase = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
                const valorActual = parseFloat(montoInput.value) || 0;

                if (valorActual < (montoBase - 0.01)) {
                    Swal.fire({
                        title: 'Monto fuera de rango',
                        text: `No puedes cobrar un monto menor a la cuota base ($${montoBase.toFixed(2)}).`,
                        icon: 'warning',
                        confirmButtonText: 'Aceptar',
                        confirmButtonColor: '#0B4E32',
                        target: document.getElementById('modal-registro-pago-credito')
                    }).then(() => {
                        montoInput.value = montoBase.toFixed(2);
                        updateMoraYTotalLite();
                    });
                }
            }
        };

        document.getElementById('pago-lite-convenio-toggle').onchange = handleConvenioToggleLite;
        
        // Configurar selección de comprobantes (Cámara y Galería)
        const cameraInput = document.getElementById('pago-lite-file-input-camera');
        const galleryInput = document.getElementById('pago-lite-file-input-gallery');
        
        if (cameraInput) cameraInput.onchange = (e) => handleLiteReceiptSelect(e.target);
        if (galleryInput) galleryInput.onchange = (e) => handleLiteReceiptSelect(e.target);

        document.getElementById('btn-lite-confirmar-pago').onclick = confirmarPagoLite;

        // Reset convenio
        const convenioToggle = document.getElementById('pago-lite-convenio-toggle');
        convenioToggle.checked = false;
        document.getElementById('pago-lite-monto-personalizado-container').style.display = 'none';

        // Primera actualización de totales
        updateMoraYTotalLite();

        if (typeof openLiteModal === 'function') openLiteModal('modal-registro-pago-credito');

    } catch (error) {
        console.error('Error opening payment modal:', error);
        if (window.Swal) Swal.fire('Error', 'No se pudieron cargar los datos del pago', 'error');
    } finally {
        if (btn) btn.classList.remove('btn-loading');
    }
}

/**
 * Actualiza los cálculos de mora y totales en tiempo real
 */
function updateMoraYTotalLite() {
    const count = parseInt(document.getElementById('pago-lite-cuotas-select').value) || 1;
    const fechaPago = document.getElementById('pago-lite-fecha').value;
    
    const cuotasSeleccionadas = currentPaymentCuotas.slice(0, count);
    const montoBase = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);
    
    // Cálculo de mora (usando lógica simplificada para móvil)
    let totalMora = 0;
    let totalDiasMora = 0;
    
    cuotasSeleccionadas.forEach(cuota => {
        const moraInfo = calcularMoraLite(cuota.fecha_vencimiento, fechaPago);
        if (moraInfo.estaEnMora) {
            totalMora += moraInfo.montoMora;
            totalDiasMora += moraInfo.diasMora;
        }
    });

    // Actualizar UI
    document.getElementById('pago-lite-monto-base').textContent = `$${montoBase.toFixed(2)}`;
    const moraRow = document.getElementById('pago-lite-mora-row');
    if (totalMora > 0) {
        moraRow.style.display = 'flex';
        document.getElementById('pago-lite-dias-mora').textContent = totalDiasMora;
        document.getElementById('pago-lite-monto-mora').textContent = `$${totalMora.toFixed(2)}`;
    } else {
        moraRow.style.display = 'none';
    }

    const totalFinal = montoBase + totalMora;
    document.getElementById('pago-lite-total-final').textContent = `$${totalFinal.toFixed(2)}`;

    // Manejo de Convenio dinámico (Móvil)
    const isConvenio = document.getElementById('pago-lite-convenio-toggle').checked;
    const hintContainer = document.getElementById('pago-lite-min-hint');
    const hintValue = document.getElementById('pago-lite-min-valor');
    const noteInput = document.getElementById('pago-lite-referencia');
    const montoInput = document.getElementById('pago-lite-monto-personalizado');

    if (isConvenio) {
        if (hintContainer) hintContainer.style.display = 'block';
        if (hintValue) hintValue.textContent = `$${montoBase.toFixed(2)}`;
        
        let montoPagar = parseFloat(montoInput.value) || 0;
        
        // Solo forzar el valor base automáticamente si el usuario NO está escribiendo en este campo
        // Esto permite que el usuario borre y escriba libremente, pero ajusta si cambia cuotas.
        if (document.activeElement !== montoInput) {
            if (montoPagar < (montoBase - 0.01)) {
                montoPagar = montoBase;
                montoInput.value = montoBase.toFixed(2);
            }
        }
        
        const descuentMora = totalFinal - montoPagar;
        
        if (noteInput) {
            noteInput.value = `[CONVENIO DE PAGO] Orig: $${totalFinal.toFixed(2)} | Cobrado: $${montoPagar.toFixed(2)} | Desc. Mora: $${descuentMora.toFixed(2)}`.trim();
        }
    } else {
        if (hintContainer) hintContainer.style.display = 'none';
        if (montoInput) montoInput.value = totalFinal.toFixed(2);
    }
}

/**
 * Maneja el toggle de Convenio de Pago
 */
async function handleConvenioToggleLite() {
    const toggle = document.getElementById('pago-lite-convenio-toggle');
    const container = document.getElementById('pago-lite-monto-personalizado-container');
    const inputMonto = document.getElementById('pago-lite-monto-personalizado');
    const refInput = document.getElementById('pago-lite-referencia');

    if (toggle.checked) {
        if (window.Swal) {
            const result = await Swal.fire({
                title: '¿Activar Convenio?',
                text: 'Se permitirá un monto inferior. La nota se generará automáticamente.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí',
                cancelButtonText: 'No',
                confirmButtonColor: '#0B4E32',
                target: document.getElementById('modal-registro-pago-credito') // Forzar que salga sobre el modal
            });

            if (result.isConfirmed) {
                container.style.display = 'block';
                if (refInput) {
                    refInput.readOnly = true;
                    refInput.style.background = "#f1f5f9";
                }
                updateMoraYTotalLite();
                setTimeout(() => inputMonto.focus(), 300);
            } else {
                toggle.checked = false;
                container.style.display = 'none';
            }
        }
    } else {
        container.style.display = 'none';
        if (refInput) {
            refInput.readOnly = false;
            refInput.value = "";
            refInput.style.background = "";
        }
    }
}

/**
 * Maneja la selección de foto/archivo
 */
function handleLiteReceiptSelect(input) {
    const file = input.files[0];
    if (!file) return;

    // Quitar error visual si existía
    const uploadZone = document.getElementById('pago-lite-upload-container');
    if (uploadZone) {
        uploadZone.style.borderColor = '';
        uploadZone.style.backgroundColor = '';
    }

    if (!file.type.startsWith('image/')) {
        if (window.Swal) Swal.fire('Error', 'Por favor selecciona una imagen', 'warning');
        return;
    }

    currentSelectedReceiptFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        const preview = document.getElementById('pago-lite-preview');
        preview.src = e.target.result;
        preview.style.display = 'block';
        document.getElementById('pago-lite-upload-placeholder').style.display = 'none';
        document.getElementById('pago-lite-remove-file').style.display = 'block';
    };
    reader.readAsDataURL(file);
}

window.clearLiteReceipt = function() {
    currentSelectedReceiptFile = null;
    const cameraInput = document.getElementById('pago-lite-file-input-camera');
    const galleryInput = document.getElementById('pago-lite-file-input-gallery');
    if (cameraInput) cameraInput.value = '';
    if (galleryInput) galleryInput.value = '';
    
    document.getElementById('pago-lite-preview').style.display = 'none';
    document.getElementById('pago-lite-upload-placeholder').style.display = 'block';
    document.getElementById('pago-lite-remove-file').style.display = 'none';
};

/**
 * Procesa el pago final en Supabase
 */
async function confirmarPagoLite() {
    const btn = document.getElementById('btn-lite-confirmar-pago');
    const originalContent = btn.innerHTML;
    
    try {
        const count = parseInt(document.getElementById('pago-lite-cuotas-select').value);
        const fechaPago = document.getElementById('pago-lite-fecha').value;
        const metodo = document.getElementById('pago-lite-metodo').value;
        const inputNota = document.getElementById('pago-lite-referencia');
        const referenciaOriginal = inputNota.value;
        const idCredito = window.currentCreditoId;
        
        const isConvenio = document.getElementById('pago-lite-convenio-toggle').checked;
        const montoInput = document.getElementById(isConvenio ? 'pago-lite-monto-personalizado' : 'pago-lite-total-final'); // Referencia visual
        const montoVal = parseFloat(document.getElementById('pago-lite-monto-personalizado').value);

        // Limpiar errores previos
        const fields = [
            { id: 'pago-lite-fecha', type: 'input' },
            { id: 'pago-lite-metodo', type: 'input' },
            { id: 'pago-lite-referencia', type: 'input' },
            { id: 'pago-lite-upload-container', type: 'container' }
        ];
        if (isConvenio) fields.push({ id: 'pago-lite-monto-personalizado', type: 'input' });

        fields.forEach(f => {
            const el = document.getElementById(f.id);
            if (el) el.style.border = '';
        });

        let hasError = false;
        if (!fechaPago) { document.getElementById('pago-lite-fecha').style.border = '2px solid #ef4444'; hasError = true; }
        if (!metodo) { document.getElementById('pago-lite-metodo').style.border = '2px solid #ef4444'; hasError = true; }
        if (!document.getElementById('pago-lite-referencia').value) { document.getElementById('pago-lite-referencia').style.border = '2px solid #ef4444'; hasError = true; }
        if (isConvenio && (isNaN(montoVal) || montoVal <= 0)) { 
            document.getElementById('pago-lite-monto-personalizado').style.border = '2px solid #ef4444'; 
            hasError = true; 
        }

        if (!currentSelectedReceiptFile) {
            const uploadZone = document.getElementById('pago-lite-upload-container');
            if (uploadZone) {
                uploadZone.style.border = '2px solid #ef4444';
                uploadZone.style.backgroundColor = 'rgba(239, 68, 68, 0.08)';
                uploadZone.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.2)';
            }
            hasError = true;
        } else {
            const uploadZone = document.getElementById('pago-lite-upload-container');
            if (uploadZone) {
                uploadZone.style.border = '';
                uploadZone.style.borderColor = '';
                uploadZone.style.backgroundColor = '';
                uploadZone.style.boxShadow = '';
            }
        }

        if (hasError) {
            if (window.Swal) Swal.fire({
                title: 'Campos Requeridos',
                text: 'Por favor complete todos los campos resaltados en rojo y suba el comprobante.',
                icon: 'warning',
                target: document.getElementById('modal-registro-pago-credito')
            });
            return;
        }

        // Validación de monto base en convenio
        const cuotasSeleccionadas = currentPaymentCuotas.slice(0, count);
        const montoBaseTotal = cuotasSeleccionadas.reduce((sum, c) => sum + parseFloat(c.cuota_total), 0);

        if (isConvenio) {
            if (montoVal < montoBaseTotal) {
                if (window.Swal) {
                    await Swal.fire({
                        title: 'Monto Insuficiente',
                        text: `No puedes cobrar un monto menor a la cuota base ($${montoBaseTotal.toFixed(2)}).`,
                        icon: 'warning',
                        confirmButtonText: 'Aceptar',
                        confirmButtonColor: '#0B4E32',
                        target: document.getElementById('modal-registro-pago-credito')
                    });
                    document.getElementById('pago-lite-monto-personalizado').value = montoBaseTotal.toFixed(2);
                    updateMoraYTotalLite();
                }
                return;
            }
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando Pago...';

        const supabase = window.getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        // 1. Subir a bucket 'inkacorp' con subcarpeta unificada
        const uploadRes = await window.uploadFileToStorage(currentSelectedReceiptFile, 'creditos/pagos', idCredito, 'inkacorp');

        if (!uploadRes.success) {
            throw new Error("No se pudo subir el comprobante: " + uploadRes.error);
        }

        const publicUrl = uploadRes.url;

        // 2. Registrar cuota por cuota
        const cuotasAPagar = currentPaymentCuotas.slice(0, count);
        const montoBaseCalculado = cuotasAPagar.reduce((sum, c) => sum + parseFloat(c.cuota_total || 0), 0);
        const excedenteConvenio = isConvenio ? (montoVal - montoBaseCalculado) : 0;
        
        // Calcular total original para las observaciones del convenio
        let totalOriginal = 0;
        cuotasAPagar.forEach(c => {
            const m = calcularMoraLite(c.fecha_vencimiento, fechaPago);
            totalOriginal += (parseFloat(c.cuota_total || 0) + m.montoMora);
        });

        for (let i = 0; i < cuotasAPagar.length; i++) {
            const cuota = cuotasAPagar[i];
            const moraInfo = calcularMoraLite(cuota.fecha_vencimiento, fechaPago);
            const cuotaBaseVal = parseFloat(cuota.cuota_total || 0);
            const montoOriginalCuota = cuotaBaseVal + moraInfo.montoMora;
            
            let montoARegistrar;
            let obsCuota = moraInfo.estaEnMora ? `Mora: $${moraInfo.montoMora.toFixed(2)} (${moraInfo.diasMora} días)` : 'Pago a tiempo';

            if (isConvenio) {
                // El excedente sobre la base se atribuye todo a la primera cuota registrada
                montoARegistrar = (i === 0) ? (cuotaBaseVal + excedenteConvenio) : cuotaBaseVal;
                
                const descuento = totalOriginal - montoVal;
                obsCuota = `[CONVENIO DE PAGO] Orig. Total: $${totalOriginal.toFixed(2)} | Pagado: $${montoVal.toFixed(2)} | Descto: $${descuento.toFixed(2)}. ${obsCuota}`;
            } else {
                montoARegistrar = montoOriginalCuota;
            }

            // Evitar registros de monto 0 o negativo que violen el check de DB
            if (montoARegistrar <= 0) {
                console.warn(`[Mobile] Saltando registro de cuota #${cuota.numero_cuota} por monto <= 0`);
                continue;
            }

            const { error: errorPago } = await supabase
                .from('ic_creditos_pagos')
                .insert({
                    id_detalle: cuota.id_detalle,
                    id_credito: idCredito,
                    fecha_pago: fechaPago,
                    monto_pagado: montoARegistrar,
                    metodo_pago: metodo,
                    referencia_pago: isConvenio ? 'CONVENIO' : referenciaOriginal,
                    observaciones: obsCuota,
                    comprobante_url: publicUrl,
                    cobrado_por: window.currentUser?.id || null
                });

            if (errorPago) throw errorPago;
        }

        if (window.Swal) {
            await Swal.fire({
                icon: 'success',
                title: 'Pago Registrado',
                text: `${count} cuota(s) procesada(s) exitosamente.`,
                timer: 2000
            });
        }

        closeLiteModal('modal-registro-pago-credito');
        closeLiteModal('modal-amortizacion-credito');
        closeLiteModal('credito-lite-modal');
        
        // Recargar datos
        await fetchLiteCreditos();

    } catch (error) {
        console.error('Error procesando pago:', error);
        if (window.Swal) Swal.fire('Error', error.message || 'No se pudo registrar el pago', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
    }
}

/**
 * Helpers lógicos (Copiados de la versión PC para independencia)
 */
async function getConsecutiveUnpaidInstallmentsLite(creditoId, startDetalleId) {
    const supabase = window.getSupabaseClient();
    const { data: allCuotas } = await supabase
        .from('ic_creditos_amortizacion')
        .select('*')
        .eq('id_credito', creditoId)
        .order('numero_cuota', { ascending: true });

    if (!allCuotas) return [];
    const startIndex = allCuotas.findIndex(c => c.id_detalle === startDetalleId);
    if (startIndex === -1) return [];

    const consecutive = [];
    for (let i = startIndex; i < allCuotas.length; i++) {
        if (allCuotas[i].estado_cuota === 'PENDIENTE' || allCuotas[i].estado_cuota === 'VENCIDO') {
            consecutive.push(allCuotas[i]);
        } else {
            break;
        }
    }
    return consecutive;
}

function calcularMoraLite(fechaVencimiento, fechaPagoStr) {
    if (!fechaVencimiento) return { diasMora: 0, montoMora: 0, estaEnMora: false };
    
    const fVenc = window.parseDate(fechaVencimiento);
    const fPago = window.parseDate(fechaPagoStr);
    
    if (!fVenc || !fPago) return { diasMora: 0, montoMora: 0, estaEnMora: false };
    
    const diffTime = fPago.getTime() - fVenc.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return { diasMora: 0, montoMora: 0, estaEnMora: false };
    
    return {
        diasMora: diffDays,
        montoMora: diffDays * 2, // $2 por día de mora
        estaEnMora: true
    };
}

/**
 * Muestra el modal informativo de confirmación de pago
 */
window.showConfirmacionPagoCredito = function(valor) {
    // Ya no usamos el informativo, usamos el PRO
    // Pero necesitamos el detalleId. Si viene de la tabla, lo tenemos.
    // Si viene del botón rápido, buscamos la próxima cuota.
    alert('Buscando próxima cuota para pago...');
}

/**
 * Maneja el inicio del proceso de pago (Abriría el modal de pago de créditos)
 */
async function handleQuickCreditPayment(id, btn) {
    // Asegurar que el ID del crédito sea el actual globalmente
    window.currentCreditoId = id;

    const c = liteCreditosData.find(item => item.id_credito === id);
    if (!c) return;

    if (btn) btn.classList.add('btn-loading');

    try {
        const supabase = window.getSupabaseClient();
        const { data: cuotas } = await supabase
            .from('ic_creditos_amortizacion')
            .select('id_detalle')
            .eq('id_credito', id)
            .in('estado_cuota', ['PENDIENTE', 'VENCIDO'])
            .order('numero_cuota', { ascending: true })
            .limit(1);

        if (cuotas && cuotas.length > 0) {
            window.openPaymentModalMobile(cuotas[0].id_detalle);
        } else {
            if (window.Swal) Swal.fire('Info', 'Este crédito no tiene cuotas pendientes', 'info');
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (btn) btn.classList.remove('btn-loading');
    }
}

/**
 * Muestra el plan de pagos (amortización) del crédito actual
 */
async function showCreditoAmortization() {
    const id = window.currentCreditoId;
    if (!id) {
        console.warn('showCreditoAmortization: No hay ID de crédito seleccionado');
        return;
    }

    const c = liteCreditosData.find(item => item.id_credito === id);
    if (!c) {
        console.error('showCreditoAmortization: Crédito no encontrado en caché local');
        return;
    }

    // Configurar cabecera del modal
    const codigoEl = document.getElementById('lite-amort-codigo');
    const socioEl = document.getElementById('lite-amort-socio');
    if (codigoEl) codigoEl.textContent = c.codigo_credito;
    if (socioEl) socioEl.textContent = c.socio?.nombre || 'Socio';

    const tbody = document.getElementById('lite-amortization-credito-body');
    if (!tbody) return;

    tbody.innerHTML = '<div style="text-align:center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Cargando plan...</div>';

    if (typeof openLiteModal === 'function') openLiteModal('modal-amortizacion-credito');

    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_creditos_amortizacion')
            .select('*')
            .eq('id_credito', id)
            .order('numero_cuota', { ascending: true });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<div style="text-align:center; padding: 2rem;">No se encontró el plan de pagos.</div>';
            return;
        }

        let nextToPayFound = false;
        const hoyStr = typeof getEcuadorDateString === 'function' ? getEcuadorDateString() : new Date().toISOString().split('T')[0];
        const hoy = window.parseDate(hoyStr);
        if (hoy) hoy.setHours(23, 59, 59, 999);

        tbody.innerHTML = data.map(cuota => {
            const isPaid = cuota.estado_cuota === 'PAGADO';
            const venc = window.parseDate(cuota.fecha_vencimiento);
            const fechaTxt = venc ? window.formatDate(venc) : '---';
            const isAtrasado = !isPaid && venc && venc <= hoy;
            
            const capitalVal = parseFloat(cuota.pago_capital || 0);
            const interesVal = parseFloat(cuota.pago_interes || 0);
            const subtotalVal = capitalVal + interesVal;
            
            let moraVal = 0;
            let totalFinal = subtotalVal;

            if (isAtrasado && venc) {
                const diffTime = Math.abs(hoy - venc);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                moraVal = diffDays * 2;
                totalFinal = subtotalVal + moraVal;
            } else if (isPaid) {
                // Si ya está pagado, mostramos lo que se guardó en DB
                totalFinal = parseFloat(cuota.cuota_total || 0);
            }

            let actionHtml = '';
            if (!isPaid && !nextToPayFound) {
                actionHtml = `
                    <div class="lite-amort-actions">
                        <button class="lite-btn-amort-pay" onclick="window.openPaymentModalMobile('${cuota.id_detalle}', this)">
                            <i class="fas fa-hand-holding-usd"></i> PAGAR AHORA
                        </button>
                    </div>`;
                nextToPayFound = true;
            } else if (isPaid) {
                actionHtml = `
                    <div class="lite-amort-actions">
                        <button class="lite-btn-amort-view" onclick="window.showReceiptDetailMobile('${cuota.id_detalle}')">
                            <i class="fas fa-file-invoice-dollar"></i> VER RECIBO
                        </button>
                    </div>`;
            }

            const statusClass = isPaid ? 'pill-pagado' : (isAtrasado ? 'pill-atrasado' : 'pill-pendiente');
            const statusLabel = isPaid ? 'PAGADO' : (isAtrasado ? 'ATRASADO' : 'PENDIENTE');

            return `
                <div class="lite-amort-card ${isPaid ? 'is-paid' : ''} ${isAtrasado ? 'is-atrasado' : ''}">
                    <div class="lite-amort-card-header">
                        <span class="lite-amort-number">CUOTA #${cuota.numero_cuota}</span>
                        <span class="lite-status-pill ${statusClass}" style="font-size: 0.65rem; padding: 2px 8px;">${statusLabel}</span>
                    </div>
                    
                    <div class="lite-amort-grid">
                        <div class="lite-amort-item">
                            <span class="lite-amort-label">Vencimiento</span>
                            <span class="lite-amort-value">${fechaTxt}</span>
                        </div>
                        <div class="lite-amort-item">
                            <span class="lite-amort-label">Capital + Int.</span>
                            <span class="lite-amort-value">$${subtotalVal.toFixed(2)}</span>
                        </div>
                    </div>

                    ${isAtrasado ? `
                    <div class="lite-amort-extra-info">
                        <div class="lite-amort-detail-row">
                            <span>Subtotal</span>
                            <span>$${subtotalVal.toFixed(2)}</span>
                        </div>
                        <div class="lite-amort-detail-row mora-text">
                            <span>Mora acumulada</span>
                            <span>$${moraVal.toFixed(2)}</span>
                        </div>
                    </div>
                    ` : ''}

                    <div class="lite-amort-footer">
                        <span class="lite-amort-total-label">${isAtrasado ? 'TOTAL A PAGAR' : 'TOTAL CUOTA'}</span>
                        <span class="lite-amort-total-value">$${totalFinal.toFixed(2)}</span>
                    </div>

                    ${actionHtml}
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Error fetching amortization:', error);
        tbody.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--error);">Error: ${error.message}</div>`;
    }
}

/**
 * Muestra el detalle del recibo en móviles
 */
async function showReceiptDetailMobile(detalleId) {
    if (typeof openLiteModal === 'function') openLiteModal('modal-pago-detalle-mobile');
    
    const container = document.getElementById('lite-pago-detalle-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align: center; padding: 3rem;">
            <div class="lite-spinner"></div>
            <p style="margin-top:1rem; color: #64748b; font-size: 0.9rem;">Obteniendo recibo...</p>
        </div>
    `;

    try {
        const supabase = window.getSupabaseClient();
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
            container.innerHTML = '<div style="text-align:center; padding: 2rem; color: #64748b;">No se encontró el registro del pago.</div>';
            return;
        }

        const infoSocio = pago.amortizacion?.credito?.socio?.nombre || 'Socio';
        const infoCredito = pago.amortizacion?.credito?.codigo_credito || '---';
        const infoCobrador = pago.cobrador?.nombre || 'Admin (Sync)';

        container.innerHTML = `
            <div class="receipt-card-mobile">
                <!-- Estilo de Tira de Pago / Recibo -->
                <div class="receipt-luxury-header" style="text-align: center; border-bottom: 2px dashed #e2e8f0; padding-bottom: 1.5rem; margin-bottom: 1.5rem;">
                    <div style="font-size: 0.7rem; color: #94a3b8; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 0.5rem;">Comprobante Digital</div>
                    <div style="font-size: 1.1rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">${infoCredito}</div>
                    <div style="color: #64748b; font-size: 0.85rem; font-weight: 500;">${infoSocio}</div>
                </div>

                <div class="receipt-amount-section" style="text-align: center; margin-bottom: 2rem; background: #f0fdf4; border-radius: 16px; padding: 1.5rem;">
                    <div style="font-size: 0.8rem; color: #166534; font-weight: 600; margin-bottom: 0.25rem;">VALOR PAGADO</div>
                    <div style="font-size: 2.2rem; font-weight: 900; color: #10b981;">$${pago.monto_pagado.toFixed(2)}</div>
                    <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.5rem; text-transform: lowercase;">vía ${pago.metodo_pago}</div>
                </div>

                <div class="receipt-info-list" style="display: flex; flex-direction: column; gap: 0.85rem;">
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Recibido por</span>
                        <span style="font-weight: 600; color: #1e293b;">${infoCobrador}</span>
                    </div>
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Fecha</span>
                        <span style="font-weight: 600; color: #1e293b;">${pago.fecha_pago}</span>
                    </div>
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Cuota Número</span>
                        <span style="font-weight: 600; color: #1e293b;">#${pago.amortizacion?.numero_cuota || '-'}</span>
                    </div>
                    ${pago.referencia_pago ? `
                    <div class="receipt-info-item" style="display: flex; justify-content: space-between; font-size: 0.9rem;">
                        <span style="color: #94a3b8;">Referencia</span>
                        <span style="font-weight: 600; color: #1e293b;">${pago.referencia_pago}</span>
                    </div>` : ''}
                    
                    ${pago.observaciones ? `
                    <div style="margin-top: 0.5rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; font-size: 0.85rem; color: #64748b; line-height: 1.4; border-left: 3px solid #cbd5e1;">
                        <strong>Nota:</strong> ${pago.observaciones}
                    </div>` : ''}
                </div>

                ${pago.comprobante_url ? `
                <div class="receipt-image-container" style="margin-top: 2rem; border-top: 1px solid #f1f5f9; padding-top: 1.5rem;">
                    <span style="font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.8rem; display: block; text-align: center;">EVIDENCIA ADJUNTA</span>
                    <div style="position: relative; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                        <img src="${pago.comprobante_url}" style="width: 100%; display: block;" onclick="window.open('${pago.comprobante_url}', '_blank')">
                        <div style="position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.5); color: white; padding: 8px; font-size: 0.7rem; text-align: center;">Toca para ampliar</div>
                    </div>
                </div>` : ''}

                <div style="text-align: center; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 15px; margin-bottom: 20px;">
                    <p style="font-size: 0.7rem; color: #cbd5e1;">ID Pago: ${pago.id_pago}</p>
                    <div style="font-size: 0.75rem; font-weight: 700; color: #94a3b8; display: flex; align-items: center; justify-content: center; gap: 8px;">
                        <img src="../img/icon-192.png" style="height: 14px; opacity: 0.3;" onerror="this.style.display='none'">
                        INKA CORP SISTEMAS
                    </div>
                </div>
                
                <button class="lite-btn-action success" onclick="closeLiteModal('modal-pago-detalle-mobile')" style="margin-top: 1rem; width: 100%; height: 50px; border-radius: 25px; font-weight: 700;">
                    <i class="fas fa-check"></i> ENTENDIDO
                </button>
            </div>
        `;
    } catch (err) {
        console.error('Error loading receipt mobile:', err);
        container.innerHTML = `<div style="text-align:center; padding: 2rem; color: var(--error);">Error al cargar recibo.</div>`;
    }
}

// Exponer funciones globales
window.showCreditoAmortization = showCreditoAmortization;
window.showReceiptDetailMobile = showReceiptDetailMobile;

/**
 * sincronizarEstadosMorososLite
 * Identifica créditos vencidos y actualiza su estado a MOROSO en segundo plano.
 */
async function sincronizarEstadosMorososLite(creditos) {
    const hoy = new Date();
    // Normalizar hoy a medianoche para comparación justa por días
    hoy.setHours(0, 0, 0, 0);

    const idsParaActualizar = [];

    creditos.forEach(c => {
        // Solo los créditos en estado ACTIVO pueden pasar a MOROSO.
        // Se ignoran explícitamente PAUSADO, CANCELADO, PRECANCELADO y los que ya son MOROSO.
        if (c.estado_credito !== 'ACTIVO') return;

        if (!c.fecha_primer_pago) return;

        // Calcular próxima fecha de pago
        const fechaBase = window.parseDate(c.fecha_primer_pago);
        if (!fechaBase) return;
        
        fechaBase.setMonth(fechaBase.getMonth() + (c.cuotas_pagadas || 0));
        
        // Si la fecha de vencimiento es menor a hoy (ya pasó)
        if (fechaBase < hoy) {
            idsParaActualizar.push(c.id_credito);
            c.estado_credito = 'MOROSO'; // Actualización local inmediata
        }
    });

    if (idsParaActualizar.length > 0) {
        console.log(`[Sync Lite] Detectados ${idsParaActualizar.length} créditos vencidos. Actualizando...`);
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
        } catch (err) {
            console.error('[Sync Lite] Error:', err);
        }
    }
}

// ==========================================
// REPORTERÍA MÓVIL (BRANDEADA Y SINCRONIZADA)
// ==========================================

const MOBILE_PAIS_CONFIG = {
    'ECUADOR': { code: 'ECU' },
    'USA': { code: 'USA' },
    'ESTADOS UNIDOS': { code: 'USA' },
    'PERU': { code: 'PEN' },
    'PERÚ': { code: 'PEN' },
    'ESPAÑA': { code: 'ESP' }
};

const MOBILE_ESTADO_CONFIG = {
    'ACTIVO': { label: 'CARTERA ACTIVA' },
    'MOROSO': { label: 'CARTERA EN MORA' },
    'PAUSADO': { label: 'CRÉDITOS PAUSADOS' },
    'PENDIENTE': { label: 'POR APROBAR' },
    'CANCELADO': { label: 'CRED. LIQUIDADOS' },
    'PRECANCELADO': { label: 'PRECANCELADOS' }
};

function getMobPaisCode(pais) {
    if (!pais) return '---';
    const p = pais.toUpperCase();
    return MOBILE_PAIS_CONFIG[p]?.code || p.substring(0, 3);
}

window.openMobileExportModal = async function() {
    let collectors = [];
    try {
        const supabase = window.getSupabaseClient();
        const { data } = await supabase.from('ic_users').select('id, nombre').eq('activo', true).order('nombre');
        collectors = data || [];
    } catch (e) {
        console.warn('Error loading collectors:', e);
    }

    const now = new Date();
    const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    let monthsHtml = `<button class="export-selector-btn active" data-value="todos">TODOS LOS MESES</button>`;
    for (let i = 0; i < 11; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = `${monthNames[d.getMonth()].toUpperCase()} ${d.getFullYear().toString().substring(2)}`;
        const value = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        monthsHtml += `<button class="export-selector-btn" data-value="${value}">${label}</button>`;
    }

    let usersHtml = `<button class="export-selector-btn active" data-value="todos">TODOS LOS USUARIOS</button>`;
    collectors.forEach(u => {
        const shortName = u.nombre.split(' ')[0].toUpperCase();
        usersHtml += `<button class="export-selector-btn" data-value="${u.id}">${shortName}</button>`;
    });

    Swal.fire({
        title: '<i class="fas fa-file-pdf"></i> Reportes de Créditos',
        showCloseButton: true,
        heightAuto: false, 
        customClass: {
            container: 'swal-mobile-container',
            popup: 'report-full-modal',
            title: 'report-modal-title'
        },
        showClass: {
            popup: 'animate__none' 
        },
        html: `
            <div class="export-options-container">
                <!-- Selector de Modo con estilo Lite -->
                <div class="report-mode-selector">
                    <button class="report-mode-btn active" data-mode="general">
                        <i class="fas fa-layer-group"></i> GENERAL
                    </button>
                    <button class="report-mode-btn" data-mode="cobros">
                        <i class="fas fa-hand-holding-dollar"></i> COBROS
                    </button>
                </div>

                <!-- Info Section -->
                <div style="background: #e0f2fe; border-left: 4px solid #0ea5e9; padding: 12px 16px; border-radius: 12px; margin-bottom: 20px;">
                    <p id="mob-export-desc" style="margin: 0; color: #0369a1; font-size: 0.8rem; font-weight: 500; line-height: 1.4;">
                        Inventario actual de cartera con saldos y estados.
                    </p>
                </div>
                
                <!-- Sección General -->
                <div id="mob-section-general">
                    <div style="background: white; border-radius: 16px; padding: 1.25rem; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <label class="export-label-corporate"><i class="fas fa-filter"></i> Estado de Cartera</label>
                        <div class="export-selector-group" id="mob-selector-estado">
                            <button class="export-selector-btn active" data-value="todos">TODOS</button>
                            <button class="export-selector-btn" data-value="ACTIVO">ACTIVOS</button>
                            <button class="export-selector-btn" data-value="MOROSO">MORA</button>
                            <button class="export-selector-btn" data-value="PAUSADO">PAUSA</button>
                            <button class="export-selector-btn" data-value="PENDIENTE">PEND.</button>
                            <button class="export-selector-btn" data-value="CANCELADO">CANC.</button>
                        </div>
                    </div>

                    <div style="background: white; border-radius: 16px; padding: 1.25rem; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <label class="export-label-corporate"><i class="fas fa-globe"></i> País de Residencia</label>
                        <div class="export-selector-group" id="mob-selector-pais">
                            <button class="export-selector-btn active" data-value="todos">TODOS</button>
                            <button class="export-selector-btn" data-value="ECUADOR">ECUADOR</button>
                            <button class="export-selector-btn" data-value="USA">EE.UU.</button>
                            <button class="export-selector-btn" data-value="PERU">PERÚ</button>
                            <button class="export-selector-btn" data-value="ESPAÑA">ESPAÑA</button>
                        </div>
                    </div>

                    <div style="background: white; border-radius: 16px; padding: 1.25rem; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <label class="export-label-corporate"><i class="fas fa-sort-amount-down"></i> Ordenar Por</label>
                        <div class="export-selector-group" id="mob-selector-order">
                            <button class="export-selector-btn active" data-value="socio">SOCIO (A-Z)</button>
                            <button class="export-selector-btn" data-value="monto">MONTO CAPITAL</button>
                            <button class="export-selector-btn" data-value="estado">POR ESTADO</button>
                        </div>
                    </div>
                </div>

                <!-- Sección Cobros -->
                <div id="mob-section-cobros" class="hidden-filter">
                    <div style="background: white; border-radius: 16px; padding: 1.25rem; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <label class="export-label-corporate"><i class="fas fa-calendar-check"></i> Mes de Recaudación</label>
                        <div class="export-selector-group" id="mob-selector-mes">
                            ${monthsHtml}
                        </div>
                    </div>

                    <div style="background: white; border-radius: 16px; padding: 1.25rem; margin-bottom: 15px; border: 1px solid #f1f5f9; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
                        <label class="export-label-corporate"><i class="fas fa-user-tie"></i> Cobrado Por</label>
                        <div class="export-selector-group" id="mob-selector-cobrador">
                            ${usersHtml}
                        </div>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 10px; opacity: 0.5; font-size: 0.7rem; font-weight: 600;">
                    INKA CORP • EXPORTADOR PDF v2.0
                </div>
            </div>
        `,
        showCancelButton: true,
        cancelButtonText: 'CANCELAR',
        confirmButtonText: '<i class="fas fa-file-arrow-down"></i> GENERAR PDF',
        confirmButtonColor: '#0E5936',
        cancelButtonColor: '#64748b',
        didOpen: () => {
            const modeBtns = document.querySelectorAll('.report-mode-btn');
            const secGeneral = document.getElementById('mob-section-general');
            const secCobros = document.getElementById('mob-section-cobros');
            const descMode = document.getElementById('mob-export-desc');

            modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.mode;
                    if (mode === 'general') {
                        secGeneral.classList.remove('hidden-filter');
                        secCobros.classList.add('hidden-filter');
                        descMode.innerText = 'Inventario actual de cartera con saldos y estados.';
                    } else {
                        secGeneral.classList.add('hidden-filter');
                        secCobros.classList.remove('hidden-filter');
                        descMode.innerText = 'Detalle de pagos recaudados por mes y usuario.';
                    }
                });
            });

            // Configurar grupos multi-selección
            ['estado', 'pais', 'mes', 'cobrador'].forEach(groupId => {
                const container = document.getElementById(`mob-selector-${groupId}`);
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
                            if (container.querySelectorAll('.export-selector-btn.active').length === 0 && todosBtn) {
                                todosBtn.classList.add('active');
                            }
                        }
                    });
                });
            });

            // Single select para Orden
            const orderContainer = document.getElementById('mob-selector-order');
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
                const container = document.getElementById(`mob-selector-${id}`);
                if (!container) return 'todos';
                const active = Array.from(container.querySelectorAll('.export-selector-btn.active')).map(btn => btn.dataset.value);
                return active.includes('todos') ? 'todos' : active;
            };
            return {
                reportType: document.querySelector('.report-mode-btn.active').dataset.mode,
                estado: getActiveValues('estado'),
                pais: getActiveValues('pais'),
                mes: getActiveValues('mes'),
                cobrador: getActiveValues('cobrador'),
                order: document.querySelector('#mob-selector-order .active').dataset.value
            };
        }
    }).then(result => {
        if (result.isConfirmed) processMobExport(result.value);
    });
};

async function processMobExport(filters) {
    Swal.fire({ 
        title: 'Generando Reporte...', 
        allowOutsideClick: false, 
        didOpen: () => Swal.showLoading() 
    });
    
    if (filters.reportType === 'cobros') {
        await processMobCobrosExport(filters);
    } else {
        let list = [...liteCreditosData];

        // 1. Filtro Estado
        if (filters.estado !== 'todos') {
            const estados = Array.isArray(filters.estado) ? filters.estado : [filters.estado];
            list = list.filter(c => estados.includes(c.estado_credito));
        }

        // 2. Filtro País
        if (filters.pais !== 'todos') {
            const paises = Array.isArray(filters.pais) ? filters.pais : [filters.pais];
            list = list.filter(c => {
                const p = (c.socio?.paisresidencia || '').toUpperCase();
                return paises.some(pref => p.includes(pref));
            });
        }

        // 3. Ordenamiento (Igual que PC)
        switch (filters.order) {
            case 'socio':
                list.sort((a, b) => (a.socio?.nombre || '').localeCompare(b.socio?.nombre || ''));
                break;
            case 'monto':
                list.sort((a, b) => parseFloat(b.capital || 0) - parseFloat(a.capital || 0));
                break;
            case 'estado':
                const priority = { 'MOROSO': 1, 'ACTIVO': 2, 'PAUSADO': 3, 'PENDIENTE': 4, 'PRECANCELADO': 5, 'CANCELADO': 6 };
                list.sort((a, b) => (priority[a.estado_credito] || 99) - (priority[b.estado_credito] || 99));
                break;
        }

        generateMobCreditosPDF(list, filters);
        Swal.close();
    }
}

async function processMobCobrosExport(filters) {
    try {
        const supabase = window.getSupabaseClient();
        let query = supabase.from('ic_creditos_pagos').select(`
            id_pago, fecha_pago, monto_pagado, metodo_pago, cobrado_por,
            cobrador:ic_users!ic_creditos_pagos_cobrado_por_fkey ( nombre ),
            detalle:ic_creditos_amortizacion!ic_creditos_pagos_id_detalle_fkey (
                cuota_total, fecha_vencimiento,
                credito:ic_creditos!ic_creditos_amortizacion_id_credito_fkey (
                    codigo_credito, socio:ic_socios ( nombre, paisresidencia )
                )
            )
        `);

        // Filtro por Cobrador
        if (filters.cobrador !== 'todos') {
            const cobradores = Array.isArray(filters.cobrador) ? filters.cobrador : [filters.cobrador];
            query = query.in('cobrado_por', cobradores);
        }

        const { data: pagos, error } = await query;
        if (error) throw error;

        let list = (pagos || []).map(p => ({ ...p, credito_info: p.detalle?.credito || {} }));
        
        // Filtro por Mes
        if (filters.mes !== 'todos') {
            const meses = Array.isArray(filters.mes) ? filters.mes : [filters.mes];
            list = list.filter(p => p.fecha_pago && meses.includes(p.fecha_pago.substring(0, 7)));
        }

        list.sort((a, b) => window.parseDate(a.fecha_pago) - window.parseDate(b.fecha_pago));
        
        if (list.length === 0) {
            Swal.fire('Sin resultados', 'No se encontraron cobros con estos filtros.', 'info');
            return;
        }

        generateMobCobrosPDF(list, filters);
        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'No se pudieron cargar los cobros', 'error');
    }
}

function generateMobCreditosPDF(data, filters) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const verde = [11, 78, 50];
    const dorado = [242, 187, 58];
    const now = new Date();

    // Branding (Igual que PC)
    try { doc.addImage('https://i.ibb.co/3mC22Hc4/inka-corp.png', 'PNG', 15, 12, 18, 18); } catch(e){}
    doc.setFontSize(18); doc.setTextColor(...verde); doc.text('INKA CORP', 38, 18);
    doc.setFontSize(10); doc.setTextColor(100); doc.text('REPORTE EJECUTIVO DE CARTERA (MÓVIL)', 38, 24);
    doc.setFontSize(8); doc.setTextColor(150); doc.text(`Generado: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 148, 18);

    doc.setDrawColor(...dorado); doc.setLineWidth(0.5); doc.line(15, 36, 195, 36);

    const rows = data.map((c, i) => {
        const fechaBase = window.parseDate(c.fecha_primer_pago);
        if (fechaBase) fechaBase.setMonth(fechaBase.getMonth() + (c.cuotas_pagadas || 0));
        
        const proxPago = (c.estado_credito === 'CANCELADO' || c.estado_credito === 'PRECANCELADO') ? '-' : window.formatDate(fechaBase);

        return [
            i + 1,
            (c.socio?.nombre || 'N/A').toUpperCase(),
            `$${parseFloat(c.capital).toFixed(2)}`,
            getMobPaisCode(c.socio?.paisresidencia),
            `${c.cuotas_pagadas}/${c.plazo}`,
            proxPago,
            MOBILE_ESTADO_CONFIG[c.estado_credito]?.label || c.estado_credito
        ];
    });

    doc.autoTable({
        startY: 40,
        head: [['#', 'SOCIO', 'CAPITAL', 'PAÍS', 'CUOTAS', 'PRÓX. PAGO', 'ESTADO']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: verde, textColor: dorado, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 7, cellPadding: 2 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 8 },
            2: { halign: 'right' },
            3: { halign: 'center' },
            4: { halign: 'center' },
            5: { halign: 'center' },
            6: { halign: 'center' }
        },
        didParseCell: (d) => {
            if (d.section === 'body' && d.column.index === 6) {
                const status = d.cell.raw;
                if (status === 'CARTERA EN MORA') {
                    d.cell.styles.fillColor = [254, 226, 226];
                    d.cell.styles.textColor = [185, 28, 28];
                    d.cell.styles.fontStyle = 'bold';
                } else if (status === 'CARTERA ACTIVA') {
                    d.cell.styles.fillColor = [220, 252, 231];
                    d.cell.styles.textColor = [21, 128, 61];
                }
            }
        },
        didDrawPage: (d) => {
            doc.setFontSize(8); doc.setTextColor(150);
            doc.text(`Página ${doc.internal.getNumberOfPages()}`, 15, doc.internal.pageSize.getHeight() - 10);
            doc.text('INKA CORP SISTEMAS © 2024', 150, doc.internal.pageSize.getHeight() - 10);
        }
    });

    doc.save(`Reporte_Cartera_Mob_${now.getTime()}.pdf`);
}

function generateMobCobrosPDF(data, filters) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'mm', 'a4');
    const verde = [11, 78, 50];
    const dorado = [242, 187, 58];
    const now = new Date();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Branding (Igual que PC)
    try { doc.addImage('https://i.ibb.co/3mC22Hc4/inka-corp.png', 'PNG', 15, 12, 18, 18); } catch(e){}
    doc.setFontSize(20); doc.setTextColor(...verde); doc.text('INKA CORP', 38, 18);
    doc.setFontSize(12); doc.setTextColor(100); doc.text('REPORTE DETALLADO DE RECAUDACIÓN (MÓVIL)', 38, 25);
    doc.setFontSize(9); doc.setTextColor(150); doc.text(`Generado: ${now.toLocaleString()}`, pageWidth - 60, 18);

    doc.setDrawColor(...dorado); doc.setLineWidth(0.6); doc.line(15, 36, pageWidth - 15, 36);
    
    let totalGeneral = 0;
    const resumenCobradores = {};

    const rows = data.map((p, i) => {
        const monto = parseFloat(p.monto_pagado || 0);
        const mora = Math.max(0, monto - parseFloat(p.detalle?.cuota_total || 0));
        totalGeneral += monto;
        
        const cobName = p.cobrador?.nombre || 'SISTEMA';
        resumenCobradores[cobName] = (resumenCobradores[cobName] || 0) + monto;

        const cParts = cobName.split(' ');
        const cShort = (cParts[0] || '') + (cParts[2] ? ' ' + cParts[2] : '');

        const row = [
            i + 1,
            (p.credito_info?.socio?.nombre || 'N/A').toUpperCase(),
            getMobPaisCode(p.credito_info?.socio?.paisresidencia),
            `$${monto.toFixed(2)}`,
            `$${mora.toFixed(2)}`,
            window.formatDate(p.fecha_pago),
            cShort.toUpperCase(),
            (p.metodo_pago || 'EFECTIVO').toUpperCase()
        ];
        row._raw = p;
        return row;
    });

    doc.autoTable({
        startY: 40,
        head: [['#', 'SOCIO', 'PAÍS', 'VALOR COB.', 'MORA CONT.', 'FECHA PAGO', 'COBRADOR', 'MÉTODO']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: verde, textColor: dorado, fontStyle: 'bold', halign: 'center' },
        styles: { fontSize: 7.5, cellPadding: 2.5 },
        columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            3: { halign: 'right', fontStyle: 'bold' },
            4: { halign: 'right' },
            5: { halign: 'center' }
        },
        didParseCell: (d) => {
            if (d.section === 'body') {
                const raw = d.row.raw._raw;
                if (raw?.fecha_pago && raw?.detalle?.fecha_vencimiento && window.parseDate(raw.fecha_pago) > window.parseDate(raw.detalle.fecha_vencimiento)) {
                    d.cell.styles.fillColor = [254, 226, 226];
                    d.cell.styles.textColor = [153, 27, 27];
                }
            }
        }
    });

    let finalY = doc.lastAutoTable.finalY + 10;
    if (finalY > doc.internal.pageSize.getHeight() - 50) { doc.addPage(); finalY = 20; }

    doc.setFontSize(10); doc.setTextColor(...verde); doc.text('RESUMEN POR COBRADOR:', 15, finalY);
    finalY += 6;
    doc.setFontSize(9); doc.setTextColor(60);
    Object.keys(resumenCobradores).forEach(name => {
        doc.text(`${name}:`, 15, finalY);
        doc.text(`$${resumenCobradores[name].toFixed(2)}`, 100, finalY, { align: 'right' });
        finalY += 5;
    });

    doc.setLineWidth(0.3); doc.line(15, finalY, 100, finalY); finalY += 6;
    doc.setFontSize(11); doc.setFont(undefined, 'bold');
    doc.text('TOTAL GENERAL RECAUDADO:', 15, finalY);
    doc.text(`$${totalGeneral.toFixed(2)}`, 100, finalY, { align: 'right' });

    doc.save(`Recaudacion_Mob_${now.getTime()}.pdf`);
}
