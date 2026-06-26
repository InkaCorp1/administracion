/**
 * INKA CORP - Módulo Situación Bancaria
 * Maneja la visualización de créditos bancarios, tabla de amortización y registro de pagos.
 */

// Estado del módulo
let bancosData = [];
let bancosDetalleData = [];
let currentBancoId = null;
let currentBancoDetalle = null;
let showingArchived = false; // State for history view
let currentBancoReceiptFile = null;

function formatBancoMoney(value) {
    return '$' + Number(value || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBancoNotificationDate(dateValue) {
    if (!dateValue) return 'N/A';

    const date = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateValue;

    return date.toLocaleDateString('es-EC', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
}

function formatBancoNotificationTimestamp() {
    return new Date().toLocaleString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function buildBancoPaymentOwnerMessage(banco, cuotaDetalle, montoPagado, fechaPago, fechaRegistro, comprobanteUrl, comentario = '') {
    const comentarioText = comentario ? `\n💬 Comentario: ${comentario}` : '';
    return `JOSÉ KLEVER NISHVE CORO se ha registrado un pago bancario con los siguientes detalles:\n\n🏦 Banco: ${(banco?.nombre_banco || 'BANCO').toUpperCase()}\n👤 A nombre de: ${(banco?.a_nombre_de || 'N/A').toUpperCase()}\n📑 Transacción: ${banco?.id_transaccion || currentBancoId || 'N/A'}\n🔢 Cuota: ${cuotaDetalle?.cuota || 'N/A'} de ${banco?.plazo || 'N/A'}\n💵 Valor pagado: ${formatBancoMoney(montoPagado)}\n📅 Fecha Pago: ${formatBancoNotificationDate(fechaPago)}${comentarioText}\n🕐 Registro: ${fechaRegistro}\n🔗 URL comprobante: ${comprobanteUrl}`;
}

function buildBancoLoggedUserMessage(usuario, banco, cuotaDetalle, montoPagado, fechaPago, joseNotified, comentario = '') {
    const nombre = usuario?.nombre || 'usuario';
    const comentarioText = comentario ? `\n💬 Comentario: ${comentario}` : '';
    const joseStatus = joseNotified
        ? 'También se ha notificado correctamente a José.'
        : 'Atención: no se pudo confirmar la notificación a José.';

    return `¡Hola ${nombre}!\n\n✅ El pago bancario se ha registrado correctamente.\n\n🏦 Banco: ${(banco?.nombre_banco || 'BANCO').toUpperCase()}\n👤 A nombre de: ${(banco?.a_nombre_de || 'N/A').toUpperCase()}\n📑 Transacción: ${banco?.id_transaccion || currentBancoId || 'N/A'}\n🔢 Cuota: ${cuotaDetalle?.cuota || 'N/A'} de ${banco?.plazo || 'N/A'}\n💵 Valor pagado: ${formatBancoMoney(montoPagado)}\n📅 Fecha Pago: ${formatBancoNotificationDate(fechaPago)}${comentarioText}\n\n${joseStatus}`;
}

async function getLoggedBancoNotificationUser(supabase) {
    const currentUser = window.currentUser || (typeof window.getCurrentUser === 'function' ? await window.getCurrentUser() : null);
    const userId = currentUser?.id;

    if (currentUser?.whatsapp) {
        return {
            id: userId,
            nombre: currentUser.nombre || currentUser.email || 'Usuario',
            whatsapp: String(currentUser.whatsapp).trim()
        };
    }

    if (!userId || !supabase) return null;

    const { data, error } = await supabase
        .from('ic_users')
        .select('id, nombre, whatsapp')
        .eq('id', userId)
        .single();

    if (error || !data?.whatsapp) return null;

    return {
        id: data.id,
        nombre: data.nombre || currentUser?.email || 'Usuario',
        whatsapp: String(data.whatsapp).trim()
    };
}

function normalizeBancoWhatsapp(value) {
    return String(value || '').replace(/\D/g, '');
}

async function sendBancoNotificationWebhook(payload) {
    if (typeof window.sendImageNotificationWebhook === 'function') {
        return Promise.race([
            window.sendImageNotificationWebhook(payload),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout webhook bancario')), 8000))
        ]).then(() => ({ success: true })).catch((error) => {
            console.error('Error enviando webhook bancario:', error);
            return { success: false, error: error.message };
        });
    }

    const WEBHOOK_URL_N8N = 'https://lpn8nwebhook.luispintasolutions.com/webhook/notificarimagenes';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const response = await fetch(WEBHOOK_URL_N8N, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
    } catch (error) {
        console.error('Error enviando webhook bancario:', error);
        return { success: false, error: error.message };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function sendBancoPdfNotificationWebhook(payload) {
    const WEBHOOK_URL_N8N = window.BANCO_PDF_WEBHOOK_URL || 'https://lpn8nwebhook.luispintasolutions.com/webhook/notificarpdf';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(WEBHOOK_URL_N8N, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { success: true };
    } catch (error) {
        console.error('Error enviando webhook PDF bancario:', error);
        return { success: false, error: error.message };
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Inicializa el módulo de Bancos
 */
async function initBancosModule() {

    // Configurar event listeners
    setupBancosEventListeners();

    // Cargar datos iniciales
    await loadBancosData();
}

/**
 * Configura los event listeners del módulo
 */
function setupBancosEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-bancos');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterBancos(e.target.value);
        });
    }

    // Botón Sincronizar
    const refreshBtn = document.getElementById('refresh-bancos');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await loadBancosData(true);
        });
    }

    // Botón Historial
    const historyBtn = document.getElementById('toggle-history-bancos');
    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            showingArchived = !showingArchived;
            // Visual toggle state
            historyBtn.classList.toggle('active', showingArchived);

            // Update Icon and Title for better UX
            const icon = historyBtn.querySelector('i');
            if (showingArchived) {
                icon.className = 'fas fa-arrow-left';
                historyBtn.title = 'Volver a Créditos Activos';
            } else {
                icon.className = 'fas fa-history';
                historyBtn.title = 'Ver Historial Pagados';
            }

            loadBancosData(true); // Forced reload when switching views to ensure display fixes apply
        });
    }

    // Modal Close buttons (general)
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            closePremiumModals();
        });
    });

    // Formulario de Pago
    const formPago = document.getElementById('form-pago-banco');
    if (formPago) {
        formPago.addEventListener('submit', handleBancoPaymentSubmit);
    }

    // Botón Generar Reporte de Pagos (En Detalle y General)
    const btnReporteModal = document.getElementById('btn-generar-reporte-pagos');
    if (btnReporteModal) {
        btnReporteModal.addEventListener('click', generateMonthlyPaymentsReport);
    }
    const btnReporteGeneral = document.getElementById('btn-reporte-general-bancos');
    if (btnReporteGeneral) {
        btnReporteGeneral.addEventListener('click', generateMonthlyPaymentsReport);
    }
    const btnEnviarPdfPagos = document.getElementById('btn-enviar-pdf-pagos-bancos');
    if (btnEnviarPdfPagos) {
        btnEnviarPdfPagos.addEventListener('click', enviarPdfPagosBancosAJose);
    }

    // Previews de imagen
    const cameraInput = document.getElementById('banco-camera');
    const galleryInput = document.getElementById('banco-gallery');

    if (cameraInput) {
        cameraInput.addEventListener('change', (e) => handleBancoImageUpload(e.target.files[0]));
    }
    if (galleryInput) {
        galleryInput.addEventListener('change', (e) => handleBancoImageUpload(e.target.files[0]));
    }

    const removePreviewBtn = document.getElementById('remove-banco-preview');
    if (removePreviewBtn) {
        removePreviewBtn.addEventListener('click', clearBancoPreview);
    }

    // Dropzone logic (hacer todo el cuadro clickable)
    const bancoDropzone = document.getElementById('pago-banco-dropzone');
    if (bancoDropzone) {
        bancoDropzone.addEventListener('click', (e) => {
            // Solo disparar si no se hizo clic en el botón de eliminar preview
            if (!e.target.closest('.btn-remove-preview')) {
                document.getElementById('banco-gallery').click();
            }
        });
    }

    // Botón Precancelar (abre el modal)
    const btnPrecancelar = document.getElementById('btn-precancelar-banco');
    if (btnPrecancelar) {
        btnPrecancelar.addEventListener('click', openPrecancelarModal);
    }

    // Inputs Precancelar
    const inputPrepayValor = document.getElementById('prepay-valor');
    if (inputPrepayValor) {
        inputPrepayValor.addEventListener('input', calculatePrepaySavings);
    }

    // Formulario Precancelar
    const formPrecancelar = document.getElementById('form-precancelar-banco');
    if (formPrecancelar) {
        formPrecancelar.addEventListener('submit', handlePrecancelarSubmit);
    }

    // Imagen Precancelar
    const prepayCamera = document.getElementById('prepay-camera');
    const prepayGallery = document.getElementById('prepay-gallery');
    if (prepayCamera) prepayCamera.addEventListener('change', (e) => handlePrepayImageUpload(e.target.files[0]));
    if (prepayGallery) prepayGallery.addEventListener('change', (e) => handlePrepayImageUpload(e.target.files[0]));

    const removePrepayBtn = document.getElementById('remove-prepay-preview');
    if (removePrepayBtn) removePrepayBtn.addEventListener('click', clearPrepayPreview);

    const prepayDropzone = document.getElementById('prepay-dropzone');
    if (prepayDropzone) {
        prepayDropzone.addEventListener('click', (e) => {
            if (!e.target.closest('.btn-remove-preview')) {
                document.getElementById('prepay-gallery').click();
            }
        });
    }

    // Edición de Logo y Nombre de Banco (Petición del usuario)
    const btnEditLogo = document.getElementById('btn-edit-bank-logo');
    const inputNewLogo = document.getElementById('input-new-bank-logo');
    if (btnEditLogo && inputNewLogo) {
        btnEditLogo.addEventListener('click', () => inputNewLogo.click());
        inputNewLogo.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                handleBankLogoUpdate(e.target.files[0]);
            }
        });
    }

    const btnEditName = document.getElementById('btn-edit-bank-name');
    if (btnEditName) {
        btnEditName.addEventListener('click', handleBankNameUpdate);
    }
}

/**
 * Carga los datos de bancos desde Supabase
 */
async function loadBancosData(forceRefresh = false) {
    const grid = document.getElementById('bancos-grid');
    const emptyMsg = document.getElementById('bancos-empty');

    if (!grid) return;

    // PASO 1: Usar caché si está disponible y es válido
    if (!forceRefresh && window.hasCacheData && window.hasCacheData('bancos')) {
        bancosData = window.getCacheData('bancos');
        const cachedPagosMap = window.dataCache.bancosPagosMap || {};
        window.currentPagosMap = cachedPagosMap; // Sync current map even from cache

        renderBancosCards(bancosData, cachedPagosMap);
        updateBancosStats(bancosData);

        // Si el caché es reciente, no re-consultar
        if (window.isCacheValid && window.isCacheValid('bancos')) {
            return;
        }
    }

    if (!bancosData.length) {
        grid.innerHTML = '<div class="loading-placeholder"><div class="spinner"></div><span>Cargando créditos bancarios...</span></div>';
    }

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible');

        let query = supabase
            .from('ic_situacion_bancaria')
            .select('*')
            .order('nombre_banco', { ascending: true });

        if (showingArchived) {
            query = query.eq('estado', 'ARCHIVADO');
        } else {
            query = query.neq('estado', 'ARCHIVADO');
        }

        const { data: bancos, error: errorBancos } = await query;

        if (errorBancos) throw errorBancos;

        bancosData = bancos || [];

        const transaccionIds = bancosData.map(b => b.id_transaccion);
        let pagosMap = {};

        if (transaccionIds.length > 0) {
            const { data: pagos, error: errorPagos } = await supabase
                .from('ic_situacion_bancaria_detalle')
                .select('transaccion')
                .eq('estado', 'PAGADO')
                .in('transaccion', transaccionIds);

            if (!errorPagos && pagos) {
                pagos.forEach(p => {
                    const key = String(p.transaccion);
                    pagosMap[key] = (pagosMap[key] || 0) + 1;
                });
            } else if (errorPagos) {
                console.error('[BANCOS] Error fetching pagos detalle:', errorPagos);
            }
        }

        window.currentPagosMap = pagosMap;

        // Guardar en caché global (Asegurar que el mapa de pagos se guarde ANTES de persistir a disco)
        if (window.setCacheData) {
            window.dataCache.bancosPagosMap = pagosMap;
            window.setCacheData('bancos', bancosData);
        }

        // Sort: Active (incomplete) first, then Paid (complete)
        bancosData.sort((a, b) => {
            const totalA = parseInt(a.contador || 0);
            const pagadasA = pagosMap[String(a.id_transaccion)] || 0;
            const isCompleteA = totalA > 0 && pagadasA >= totalA;

            const totalB = parseInt(b.contador || 0);
            const pagadasB = pagosMap[String(b.id_transaccion)] || 0;
            const isCompleteB = totalB > 0 && pagadasB >= totalB;

            if (isCompleteA === isCompleteB) return 0;
            return isCompleteA ? 1 : -1;
        });

        renderBancosCards(bancosData, pagosMap);
        updateBancosStats(bancosData);

        if (bancosData.length === 0) {
            if (emptyMsg) emptyMsg.classList.remove('hidden');
        } else {
            if (emptyMsg) emptyMsg.classList.add('hidden');
        }

    } catch (error) {
        console.error('Error al cargar datos de bancos:', error);
        if (grid) {
            grid.innerHTML = `<div class="error-container">Error: ${error.message}</div>`;
        }
    }
}

/**
 * Actualiza las estadísticas del hero
 */
function updateBancosStats(data) {
    document.getElementById('stat-bancos-activos').textContent = data.length;

    const deudaTotal = data.reduce((sum, b) => {
        const monto = parseFloat(b.monto_final || 0);
        // Aquí deberíamos calcular el pendiente real basado en detalle si lo tenemos cargado,
        // por ahora usamos monto_final como referencia si no hay detalles.
        return sum + monto;
    }, 0);

    document.getElementById('stat-bancos-deuda-total').textContent =
        '$' + deudaTotal.toLocaleString('es-EC', { minimumFractionDigits: 2 });
}

/**
 * Renderiza las tarjetas de bancos
 */
/**
 * Obtiene el esquema de colores según el banco
 */
function getBankTheme(bankName) {
    const name = (bankName || '').toUpperCase();

    // Default (INKA CORP Green)
    const themes = {
        DEFAULT: {
            bg: 'linear-gradient(145deg, rgba(11, 78, 50, 0.15) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: 'var(--primary-light)',
            light: '#22c55e',
            glow: 'rgba(11, 78, 50, 0.5)',
            border: 'rgba(11, 78, 50, 0.3)',
            textOnPill: 'var(--white)'
        },
        PICHINCHA: {
            bg: 'linear-gradient(145deg, rgba(242, 187, 58, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#F2BB3A', // Amarillo Pichincha
            light: '#F5D070',
            glow: 'rgba(242, 187, 58, 0.4)',
            border: 'rgba(242, 187, 58, 0.25)',
            textOnPill: '#ffffff'
        },
        GUAYAQUIL: {
            bg: 'linear-gradient(145deg, rgba(225, 0, 152, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#FF1493', // Rosa Guayaquil
            light: '#FF69B4',
            glow: 'rgba(225, 0, 152, 0.4)',
            border: 'rgba(225, 0, 152, 0.25)',
            textOnPill: '#ffffff'
        },
        PACIFICO: {
            bg: 'linear-gradient(145deg, rgba(0, 112, 186, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#00AEEF', // Azul Pacífico
            light: '#5BA3B8',
            glow: 'rgba(0, 174, 239, 0.4)',
            border: 'rgba(0, 112, 186, 0.25)',
            textOnPill: '#ffffff'
        },
        PRODUBANCO: {
            bg: 'linear-gradient(145deg, rgba(0, 135, 81, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#22c55e',
            light: '#4ade80',
            glow: 'rgba(34, 197, 94, 0.4)',
            border: 'rgba(0, 135, 81, 0.25)',
            textOnPill: '#ffffff'
        },
        MUSHUC_RUNA: {
            bg: 'linear-gradient(145deg, rgba(26, 93, 26, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#2d8a2d',
            light: '#4ade80',
            glow: 'rgba(45, 138, 45, 0.4)',
            border: 'rgba(26, 93, 26, 0.25)',
            textOnPill: '#ffffff'
        },
        DAQUILEMA: {
            bg: 'linear-gradient(145deg, rgba(220, 38, 38, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#ef4444',
            light: '#f87171',
            glow: 'rgba(239, 68, 68, 0.4)',
            border: 'rgba(220, 38, 38, 0.25)',
            textOnPill: '#ffffff'
        },
        TUPAK: {
            bg: 'linear-gradient(145deg, rgba(37, 99, 235, 0.12) 0%, rgba(17, 19, 24, 0.6) 100%)',
            primary: '#60a5fa',
            light: '#93c5fd',
            glow: 'rgba(96, 165, 250, 0.4)',
            border: 'rgba(37, 99, 235, 0.25)',
            textOnPill: '#ffffff'
        }
    };

    if (name.includes('PICHINCHA')) return themes.PICHINCHA;
    if (name.includes('GUAYAQUIL')) return themes.GUAYAQUIL;
    if (name.includes('PACIFICO')) return themes.PACIFICO;
    if (name.includes('PRODUBANCO')) return themes.PRODUBANCO;
    if (name.includes('MUSHUC')) return themes.MUSHUC_RUNA;
    if (name.includes('DAQUILEMA')) return themes.DAQUILEMA;
    if (name.includes('TUPAK')) return themes.TUPAK;

    return themes.DEFAULT;
}

/**
 * Obtiene la clase de zoom para logos específicos que se ven pequeños
 */
function getLogoZoomClass(bankName) {
    const name = (bankName || '').toUpperCase();
    if (name.includes('DAQUILEMA')) return 'zoom-max';
    if (name.includes('MUSHUC')) return 'zoom-high';
    if (name.includes('PACIFICO')) return 'zoom-high';
    if (name.includes('PRODUBANCO')) return 'zoom-low';
    return '';
}

/**
 * Renderiza las tarjetas de bancos
 */
function renderBancosCards(data, pagosMap = {}) {
    const grid = document.getElementById('bancos-grid');
    if (!grid) return;

    grid.innerHTML = '';

    data.forEach(banco => {
        const theme = getBankTheme(banco.nombre_banco);
        const card = document.createElement('div');
        card.className = 'bank-card';
        card.onclick = () => openBancoDetail(banco);

        // Aplicar variables de tema
        card.style.setProperty('--bank-bg', theme.bg);
        card.style.setProperty('--bank-primary', theme.primary);
        card.style.setProperty('--bank-light', theme.light);
        card.style.setProperty('--bank-glow', theme.glow);
        card.style.setProperty('--bank-border', theme.border);
        card.style.setProperty('--bank-pill-text', theme.textOnPill);

        // Calcular progreso real con los datos obtenidos
        const totalCuotas = parseInt(banco.contador || 0);
        let pagadas = pagosMap[String(banco.id_transaccion)] || 0;

        // Evitar parpadeo: Si el mapa de pagos está vacío pero hay cuotas, 
        // y no estamos forzando refresco, podría ser un estado de carga inicial.
        // Sin embargo, si ya tenemos datos en pagosMap (aunque sea de cache), se usará.

        // Si el crédito está ARCHIVADO y estamos en la vista de historial, forzar estado de completado para visualización
        if (showingArchived && (banco.estado || '').toUpperCase() === 'ARCHIVADO') {
            pagadas = totalCuotas;
        }

        const pct = totalCuotas > 0 ? Math.round((pagadas / totalCuotas) * 100) : 0;

        // Saldo pendiente estimado (Monto final - (pagadas * mensual))
        // Ojo: esto es una estimación si no tenemos el total pagado exacto aqui.
        // Si queremos exacto, deberíamos sumar los montos en el query anterior.
        // Por simplicidad y consistencia visual usaremos esto o el valor_descontado si existe.
        const mensual = parseFloat(banco.mensual || 0);
        const montoFinal = parseFloat(banco.monto_final || 0);
        let pendiente = montoFinal - (pagadas * mensual);
        if (pendiente < 0 || (showingArchived && (banco.estado || '').toUpperCase() === 'ARCHIVADO')) {
            pendiente = 0;
        }

        card.innerHTML = `
            <div class="bank-card-header">
                <span class="bank-name-label">${banco.nombre_banco}</span>
                <div class="bank-progress-circle">${pagadas}/${totalCuotas}</div>
            </div>
            
            <div class="bank-card-progress">
                <div class="progress-label-group">
                    <span>Progreso del Crédito</span>
                    <span class="progress-percentage">${pct}%</span>
                </div>
                <div class="progress-bar-container">
                    <div class="progress-bar-fill" style="width: ${pct}%"></div>
                </div>
            </div>

            <div class="bank-card-amounts">
                <div class="amount-item">
                    <span class="amount-label">Valor Cuota</span>
                    <span class="amount-value">$${mensual.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                </div>
                <div class="amount-item">
                    <span class="amount-label">Saldo Pendiente</span>
                    <span class="amount-value pending">$${pendiente.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                </div>
            </div>

            <div class="bank-card-footer">
                <span class="debtor-label">DEUDOR</span>
                <span class="debtor-name">${banco.a_nombre_de || 'N/A'}</span>
                ${pct >= 100 && !showingArchived ? `<button class="btn-delete-credit" onclick="archiveBanco(event, '${banco.id_transaccion}')"><i class="fas fa-archive"></i> Mover al Historial</button>` : ''}
                ${showingArchived ? `
                    <div class="archived-badge"><i class="fas fa-check-circle"></i> Archivado</div>
                    <button class="btn-unarchive-credit" onclick="unarchiveBanco(event, '${banco.id_transaccion}')">
                        <i class="fas fa-undo"></i> Mover a Activos
                    </button>
                ` : ''}
            </div>

            <!-- Logo en la esquina inferior derecha -->
            ${(() => {
                let logoUrl = banco.logo_banco;
                if ((banco.nombre_banco || '').toUpperCase().includes('PICHINCHA')) {
                    logoUrl = 'https://lh3.googleusercontent.com/d/10zy2rxIR2dp_MfdGO7JiOjVvovGSIGCZ=w2048?name=Pichincha.png';
                }

                if (logoUrl) {
                    const zoomClass = getLogoZoomClass(banco.nombre_banco);
                    return `<img src="${logoUrl}" class="bank-card-logo ${zoomClass}" alt="Logo">`;
                } else {
                    return `<div class="bank-card-logo-icon"><i class="fas fa-university"></i></div>`;
                }
            })()}
        `;
        grid.appendChild(card);
    });
}

/**
 * Archiva un crédito pagado (Soft Delete)
 */
async function archiveBanco(event, id) {
    event.stopPropagation(); // Evitar abrir el modal

    const confirmed = await window.showConfirm(
        '¿Deseas mover este crédito al historial de pagados? Desaparecerá de esta lista.',
        'Mover al Historial',
        { confirmText: 'Mover al Historial', cancelText: 'Cancelar', type: 'warning' }
    );

    if (!confirmed) return;

    try {
        const supabase = window.getSupabaseClient();

        // Update status to 'ARCHIVADO'
        const { error } = await supabase
            .from('ic_situacion_bancaria')
            .update({ estado: 'ARCHIVADO' })
            .eq('id_transaccion', id);

        if (error) throw error;

        window.showToast('Crédito movido al historial', 'success');
        await loadBancosData(true); // Recargar datos

    } catch (error) {
        console.error('Error al archivar crédito:', error);
        window.showAlert('No se pudo archivar: ' + error.message, 'Error', 'error');
    }
}

/**
 * Desarchiva un crédito (Mueve de ARCHIVADO a ACTIVO)
 */
async function unarchiveBanco(event, id) {
    event.stopPropagation();

    const confirmed = await window.showConfirm(
        '¿Deseas mover este crédito de vuelta a la lista de activos?',
        'Mover a Activos',
        { confirmText: 'Mover a Activos', cancelText: 'Cancelar', type: 'question' }
    );

    if (!confirmed) return;

    try {
        const supabase = window.getSupabaseClient();

        // Update status to 'ACTIVO' or simply remove state if null is allowed
        const { error } = await supabase
            .from('ic_situacion_bancaria')
            .update({ estado: 'ACTIVO' })
            .eq('id_transaccion', id);

        if (error) throw error;

        window.showToast('Crédito movido a activos', 'success');
        await loadBancosData(true);

    } catch (error) {
        console.error('Error al desarchivar crédito:', error);
        window.showAlert('No se pudo desarchivar: ' + error.message, 'Error', 'error');
    }
}

/**
 * Elimina permanentemente un crédito bancario (incluye detalle).
 * Muestra confirmación tipo 'danger' y, si el usuario acepta, borra primero
 * los registros de `ic_situacion_bancaria_detalle` y luego el encabezado
 * en `ic_situacion_bancaria`. Cierra el modal y recarga la lista al terminar.
 */
async function deleteBancoPermanently(event, id) {
    event?.stopPropagation?.();
    if (!id) return;

    const confirmado = await window.showConfirm(
        'Esta acción eliminará completamente el crédito y todos sus comprobantes/pagos. \n\nESTA OPERACIÓN ES IRREVERSIBLE. ¿Deseas continuar?',
        'Eliminar crédito definitivamente',
        { confirmText: 'Eliminar permanentemente', cancelText: 'Cancelar', type: 'danger' }
    );
    if (!confirmado) return;

    const btn = document.getElementById('btn-delete-banco');
    if (btn) { btn.disabled = true; btn.classList.add('loading'); }

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible');

        // 1) Borrar detalle (si existe)
        const { error: errDet } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .delete()
            .eq('transaccion', id);
        if (errDet) throw errDet;

        // 2) Borrar encabezado
        const { error: errHead } = await supabase
            .from('ic_situacion_bancaria')
            .delete()
            .eq('id_transaccion', id);
        if (errHead) throw errHead;

        window.showToast('Crédito eliminado correctamente', 'success');
        closePremiumModals();
        await loadBancosData(true);
    } catch (err) {
        console.error('Error al eliminar crédito:', err);
        window.showAlert('No se pudo eliminar el crédito: ' + (err?.message || err), 'Error', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.classList.remove('loading'); }
    }
}
window.deleteBancoPermanently = deleteBancoPermanently;

/**
 * Filtra las tarjetas por texto
 */
function filterBancos(query) {
    const q = query.toLowerCase();
    const filtered = bancosData.filter(b =>
        (b.nombre_banco || '').toLowerCase().includes(q) ||
        (b.a_nombre_de || '').toLowerCase().includes(q) ||
        (b.motivo || '').toLowerCase().includes(q)
    );
    // Note: We need the pagosMap here. For simplicity, we can store it globally or re-fetch.
    // Let's assume for this specific fix we just want the Initial Load to work. 
    // Ideally, we refactor loadBancosData to store global PagosMap.
    renderBancosCards(filtered, window.currentPagosMap || {});
}

/**
 * Abre el modal de detalle de un banco
 */
async function openBancoDetail(banco) {
    currentBancoId = banco.id_transaccion;
    const modal = document.getElementById('modal-detalle-banco');

    // Llenar datos básicos
    // Consolidación de Logo para Banco Pichincha (usar logo moderno)
    let logoUrl = banco.logo_banco;
    if ((banco.nombre_banco || '').toUpperCase().includes('PICHINCHA')) {
        logoUrl = 'https://lh3.googleusercontent.com/d/10zy2rxIR2dp_MfdGO7JiOjVvovGSIGCZ=w2048?name=Pichincha.png';
    }

    const logoImg = document.getElementById('modal-bank-logo');
    const logoIcon = document.getElementById('modal-bank-logo-icon');

    if (logoUrl) {
        logoImg.src = logoUrl;
        logoImg.classList.remove('hidden');
        logoIcon.classList.add('hidden');

        // Aplicar Zoom según la institución
        const bankName = (banco.nombre_banco || '').toUpperCase();
        logoImg.classList.remove('logo-zoom-max', 'logo-zoom-high', 'logo-zoom-low'); // Reset entries

        if (bankName.includes('DAQUILEMA')) {
            logoImg.classList.add('logo-zoom-max');
        } else if (bankName.includes('MUSHUC')) {
            logoImg.classList.add('logo-zoom-high');
        } else if (bankName.includes('PACIFICO') || bankName.includes('TUPAK')) {
            logoImg.classList.add('logo-zoom-low');
        }
    } else {
        logoImg.classList.add('hidden');
        logoIcon.classList.remove('hidden');
    }

    document.getElementById('modal-bank-name').textContent = banco.nombre_banco;
    document.getElementById('modal-credit-id').textContent = `ID: ${banco.id_transaccion}`;

    // Mostrar botón de edición de logo solo si no es un logo hardcoded (opcional) o siempre
    const btnEditLogo = document.getElementById('btn-edit-bank-logo');
    if (btnEditLogo) btnEditLogo.classList.remove('hidden');

    document.getElementById('det-banco-monto').textContent = '$' + parseFloat(banco.valor || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-plazo').textContent = `${banco.plazo} cuotas`;
    document.getElementById('det-banco-cuota').textContent = '$' + parseFloat(banco.mensual || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-interes').textContent = `${banco.interes}%`;

    // Calculo refinado de Monto Entregado: valor (solicitado) - valor_descontado
    const montoSolicitado = parseFloat(banco.valor || 0);
    const montoDescontado = parseFloat(banco.valor_descontado || 0);
    const montoEntregado = montoSolicitado - montoDescontado;

    document.getElementById('det-banco-entregado').textContent = '$' + montoEntregado.toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-total-pagar').textContent = '$' + parseFloat(banco.monto_final || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-deudor').textContent = banco.a_nombre_de;
    document.getElementById('det-banco-motivo').textContent = banco.motivo;

    // Mostrar modal y mostrar skeleton mientras se carga la tabla
    showBancoSkeleton();
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');

    try {
        // Cargar tabla de amortización (puede tardar — mantener skeleton hasta que termine)
        await loadAmortizacionBanco(banco.id_transaccion);
    } finally {
        // Siempre ocultar skeleton aunque la carga falle para no bloquear la UI
        hideBancoSkeleton();
    }
}

// Muestra el skeleton y oculta las secciones que parpadean
function showBancoSkeleton() {
    const sk = document.getElementById('modal-banco-skeleton');
    const skR = document.getElementById('modal-banco-skeleton-right');
    const tabla = document.getElementById('tabla-amortizacion-banco');
    const resumen = document.querySelector('.preview-column .resumen-pago');
    const values = document.querySelector('.preview-column .values-grid');

    if (sk) sk.classList.remove('hidden');
    if (skR) skR.classList.remove('hidden');
    if (tabla) tabla.classList.add('hidden');
    if (resumen) resumen.classList.add('hidden');
    if (values) values.classList.add('hidden');
}

// Oculta el skeleton y restaura las secciones reales
function hideBancoSkeleton() {
    const sk = document.getElementById('modal-banco-skeleton');
    const skR = document.getElementById('modal-banco-skeleton-right');
    const tabla = document.getElementById('tabla-amortizacion-banco');
    const resumen = document.querySelector('.preview-column .resumen-pago');
    const values = document.querySelector('.preview-column .values-grid');

    if (sk) sk.classList.add('hidden');
    if (skR) skR.classList.add('hidden');
    if (tabla) tabla.classList.remove('hidden');
    if (resumen) resumen.classList.remove('hidden');
    if (values) values.classList.remove('hidden');
}

/**
 * Verifica si hay pagos en el mes actual para activar el botón de reporte
 */
async function checkMonthlyPayments(bancoId) {
    const btn = document.getElementById('btn-generar-reporte-pagos');
    if (!btn) return;

    // Ya no lo ocultamos por defecto, el usuario puede querer ver reportes de meses anteriores
    btn.classList.remove('hidden');
}

function parseBancoLocalDate(value) {
    if (!value) return null;
    const raw = String(value).slice(0, 10);
    const parts = raw.split('-').map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

function formatBancoDateISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getBancoMonthlyReportPeriod(baseDate = new Date()) {
    const start = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
    const reportStart = new Date(baseDate.getFullYear(), baseDate.getMonth(), 2);
    const nextMonthFirst = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 1);

    return {
        start,
        reportStart,
        end: nextMonthFirst,
        startISO: formatBancoDateISO(start),
        reportStartISO: formatBancoDateISO(reportStart),
        endISO: formatBancoDateISO(nextMonthFirst),
        month: start.getMonth(),
        year: start.getFullYear(),
        monthName: start.toLocaleDateString('es-EC', { month: 'long' })
    };
}

function resolveBancoPaymentStatus(pago, today = new Date()) {
    const estado = String(pago.estado || '').toUpperCase();
    if (estado === 'PAGADO') return 'PAGADO';

    const dueDate = parseBancoLocalDate(pago.fecha_pago);
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (dueDate && dueDate < todayOnly) return 'MOROSO';

    return 'PENDIENTE';
}

function normalizeBancoMonthlyPayment(pago, banco, today = new Date()) {
    const estadoReporte = resolveBancoPaymentStatus(pago, today);

    return {
        ...pago,
        estado_reporte: estadoReporte,
        banco: banco?.nombre_banco || 'Banco',
        logo_url: banco?.logo_banco || '',
        a_nombre_de: banco?.a_nombre_de || 'N/A',
        tipo_transaccion: banco?.tipo_transaccion || '',
        fecha_obj: parseBancoLocalDate(pago.fecha_pago),
        valor_num: Number(pago.valor || 0)
    };
}

function buildBancoWeekendAnalysis(pagos) {
    const weekend = [];
    const monday = [];

    pagos.forEach(pago => {
        if (!pago.fecha_obj || pago.estado_reporte === 'PAGADO') return;
        const day = pago.fecha_obj.getDay();
        const dateText = pago.fecha_obj.toLocaleDateString('es-EC', {
            weekday: 'long',
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });

        if (day === 0 || day === 6) {
            weekend.push(`${pago.banco} - ${dateText}`);
        } else if (day === 1) {
            monday.push(`${pago.banco} - ${dateText}`);
        }
    });

    if (!weekend.length && !monday.length) {
        return 'Durante el periodo analizado no se registran obligaciones pendientes en sabado o domingo. Se recomienda mantener fondos disponibles y revisar feriados bancarios para evitar retrasos.';
    }

    const lines = [];
    if (weekend.length) {
        lines.push(`Pagos pendientes en fin de semana: ${weekend.join('; ')}. Se recomienda realizarlos el viernes anterior o el dia habil previo.`);
    }
    if (monday.length) {
        lines.push(`Pagos pendientes en lunes: ${monday.join('; ')}. Conviene prever fondos desde el viernes anterior.`);
    }

    return lines.join(' ');
}

function calculateBancoPaymentSummary(pagos) {
    return (pagos || []).reduce((summary, pago) => {
        const value = Number(pago.valor_num || pago.valor || 0);
        const status = pago.estado_reporte || resolveBancoPaymentStatus(pago);

        summary.totalProgramado += value;
        summary.counts[status] = (summary.counts[status] || 0) + 1;
        summary.amounts[status] = (summary.amounts[status] || 0) + value;

        if (status !== 'PAGADO') {
            summary.totalNoPagado += value;
        }

        if (status === 'MOROSO') {
            summary.totalPonerseAlDia += value;
        }

        return summary;
    }, {
        totalProgramado: 0,
        totalNoPagado: 0,
        totalPonerseAlDia: 0,
        counts: { PAGADO: 0, PENDIENTE: 0, MOROSO: 0 },
        amounts: { PAGADO: 0, PENDIENTE: 0, MOROSO: 0 }
    });
}

function addBancoReportHeader(doc, period, summary, generatedAt, pdfImages = {}) {
    doc.setFillColor(11, 78, 50);
    doc.rect(0, 0, 210, 32, 'F');

    addBancoPdfImage(doc, pdfImages.inkaLogo, 14, 7, 17, 17);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text('INKA CORP', 36, 15);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Pagos a bancos - ${period.monthName} ${period.year}`, 36, 22);
    doc.text(`Generado: ${generatedAt}`, 132, 14);
    doc.text(`Corte: ${period.reportStartISO} a ${period.endISO}`, 132, 21);

    doc.setTextColor(15, 23, 42);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(14, 40, 182, 38, 3, 3, 'F');

    const metricY = 49;
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('TOTAL PROGRAMADO', 20, metricY);
    doc.text('PAGADO', 72, metricY);
    doc.text('PENDIENTE', 112, metricY);
    doc.text('MOROSO', 154, metricY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(11, 78, 50);
    doc.text(formatBancoMoney(summary.totalProgramado), 20, metricY + 8);
    doc.setTextColor(22, 163, 74);
    doc.text(formatBancoMoney(summary.amounts.PAGADO), 72, metricY + 8);
    doc.setTextColor(217, 119, 6);
    doc.text(formatBancoMoney(summary.amounts.PENDIENTE), 112, metricY + 8);
    doc.setTextColor(185, 28, 28);
    doc.text(formatBancoMoney(summary.amounts.MOROSO), 154, metricY + 8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(`${summary.counts.PAGADO || 0} pago(s)`, 72, metricY + 15);
    doc.text(`${summary.counts.PENDIENTE || 0} pago(s)`, 112, metricY + 15);
    doc.text(`${summary.counts.MOROSO || 0} pago(s)`, 154, metricY + 15);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(185, 28, 28);
    doc.text(`Total para ponerse al dia: ${formatBancoMoney(summary.totalPonerseAlDia)}`, 20, metricY + 25);
    doc.setTextColor(217, 119, 6);
    doc.text(`Total no pagado: ${formatBancoMoney(summary.totalNoPagado)}`, 112, metricY + 25);
}

function addBancoStatusBadge(doc, status, x, y) {
    const colors = {
        PAGADO: [22, 163, 74],
        PENDIENTE: [217, 119, 6],
        MOROSO: [185, 28, 28]
    };
    const color = colors[status] || [71, 85, 105];
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x, y - 4, 24, 6, 2, 2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(6);
    doc.setFont('helvetica', 'bold');
    doc.text(status, x + 12, y, { align: 'center' });
}

function getBancoPdfImageFormat(dataUrl) {
    if (!dataUrl) return 'PNG';
    if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
    if (dataUrl.startsWith('data:image/png')) return 'PNG';
    if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
    return 'PNG';
}

function addBancoPdfImage(doc, dataUrl, x, y, w, h) {
    if (!dataUrl) return false;

    try {
        doc.addImage(dataUrl, getBancoPdfImageFormat(dataUrl), x, y, w, h, undefined, 'FAST');
        return true;
    } catch (error) {
        console.warn('No se pudo insertar imagen en PDF bancario:', error);
        return false;
    }
}

async function loadBancoPdfImages(pagos) {
    const images = {
        inkaLogo: null,
        bankLogos: {}
    };
    const inkaLogoUrl = 'https://lh3.googleusercontent.com/d/15J6Aj6ZwkVrmDfs6uyVk-oG0Mqr-i9Jn=w2048';

    images.inkaLogo = await fetchImageAsBase64(inkaLogoUrl);

    const uniqueLogoUrls = [...new Set((pagos || []).map(pago => pago.logo_url).filter(Boolean))];
    await Promise.all(uniqueLogoUrls.map(async (url) => {
        images.bankLogos[url] = await fetchImageAsBase64(url);
    }));

    return images;
}

function addBancoPaymentsManualTable(doc, tableRows, startY, pdfImages = {}) {
    const columns = [
        { label: '', x: 14, width: 12 },
        { label: 'Banco', x: 28, width: 45 },
        { label: 'Titular', x: 75, width: 43 },
        { label: 'Fecha', x: 120, width: 22 },
        { label: 'Valor', x: 146, width: 24 },
        { label: 'Estado', x: 172, width: 24 }
    ];
    let y = startY;

    const drawHeader = () => {
        if (y > 264) {
            doc.addPage();
            y = 18;
        }

        doc.setFillColor(11, 78, 50);
        doc.roundedRect(14, y, 182, 8, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(255, 255, 255);

        columns.forEach(col => {
            if (!col.label) return;
            const align = col.label === 'Valor' ? 'right' : col.label === 'Estado' ? 'center' : 'left';
            const textX = align === 'right' ? col.x + col.width - 2 : align === 'center' ? col.x + col.width / 2 : col.x + 2;
            doc.text(col.label, textX, y + 5.3, { align });
        });
        y += 10;
    };

    drawHeader();

    tableRows.forEach((row, index) => {
        const bancoLines = doc.splitTextToSize(String(row.banco || ''), columns[1].width - 4).slice(0, 2);
        const titularLines = doc.splitTextToSize(String(row.titular || ''), columns[2].width - 4).slice(0, 2);
        const rowHeight = Math.max(12, (Math.max(bancoLines.length, titularLines.length) * 4) + 5);

        if (y + rowHeight > 282) {
            doc.addPage();
            y = 18;
            drawHeader();
        }

        if (index % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(14, y - 2, 182, rowHeight, 'F');
        }

        doc.setDrawColor(226, 232, 240);
        doc.line(14, y + rowHeight - 2, 196, y + rowHeight - 2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        const logo = pdfImages.bankLogos?.[row.logo_url];
        if (logo) {
            addBancoPdfImage(doc, logo, columns[0].x + 2, y + 1, 7, 7);
        } else {
            doc.setFillColor(226, 232, 240);
            doc.circle(columns[0].x + 5.5, y + 5, 3, 'F');
        }

        doc.setTextColor(15, 23, 42);
        doc.text(bancoLines, columns[1].x + 2, y + 3);
        doc.setTextColor(71, 85, 105);
        doc.text(titularLines, columns[2].x + 2, y + 3);

        doc.setTextColor(15, 23, 42);
        doc.text(String(row.fecha || ''), columns[3].x + columns[3].width / 2, y + 5, { align: 'center' });
        doc.text(String(row.valor || ''), columns[4].x + columns[4].width - 2, y + 5, { align: 'right' });
        addBancoStatusBadge(doc, row.estado, columns[5].x, y + 5);

        y += rowHeight;
    });

    return y;
}

function inspectBancoPdfBase64(pdfBase64) {
    const cleanBase64 = String(pdfBase64 || '').replace(/^data:application\/pdf;base64,/, '').trim();
    if (!cleanBase64) {
        return { valid: false, reason: 'No se genero contenido base64 para el PDF.', cleanBase64, sizeBytes: 0 };
    }

    if (!/^[A-Za-z0-9+/=]+$/.test(cleanBase64)) {
        return { valid: false, reason: 'El contenido base64 contiene caracteres invalidos.', cleanBase64, sizeBytes: 0 };
    }

    let binary = '';
    try {
        binary = atob(cleanBase64);
    } catch (error) {
        return { valid: false, reason: 'El contenido base64 no se puede decodificar.', cleanBase64, sizeBytes: 0 };
    }

    const sizeBytes = binary.length;
    const header = binary.slice(0, 5);
    const tail = binary.slice(Math.max(0, sizeBytes - 2048));

    if (sizeBytes < 5000) {
        return { valid: false, reason: `El PDF generado pesa solo ${sizeBytes} bytes.`, cleanBase64, sizeBytes };
    }

    if (header !== '%PDF-') {
        return { valid: false, reason: `El archivo generado no inicia como PDF valido (${header || 'sin cabecera'}).`, cleanBase64, sizeBytes };
    }

    if (!tail.includes('%%EOF')) {
        return { valid: false, reason: 'El PDF generado no tiene cierre %%EOF.', cleanBase64, sizeBytes };
    }

    return { valid: true, reason: 'PDF valido.', cleanBase64, sizeBytes };
}

function addBancoCalendarPage(doc, pagos, period, pdfImages = {}) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(11, 78, 50);
    doc.text('Calendario de pagos', 14, 18);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text('Incluye el mes actual y el dia 1 del mes siguiente.', 14, 25);

    const calendarPayments = {};
    pagos.forEach(pago => {
        if (!pago.fecha_obj) return;
        const key = formatBancoDateISO(pago.fecha_obj);
        if (!calendarPayments[key]) calendarPayments[key] = [];
        calendarPayments[key].push(pago);
    });

    const days = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const startX = 14;
    const startY = 38;
    const cellW = 26;
    const cellH = 24;
    const gap = 1.6;

    days.forEach((day, idx) => {
        const x = startX + idx * (cellW + gap);
        doc.setFillColor(243, 244, 246);
        doc.rect(x, startY, cellW, 8, 'F');
        doc.setTextColor(15, 23, 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(day, x + cellW / 2, startY + 5.5, { align: 'center' });
    });

    const firstDay = new Date(period.year, period.month, 1).getDay();
    const offset = firstDay === 0 ? 6 : firstDay - 1;
    const daysInMonth = new Date(period.year, period.month + 1, 0).getDate();
    const todayISO = formatBancoDateISO(new Date());

    const renderCalendarCell = (index, date, dayLabel, pagosDia, isNextMonth = false) => {
        const col = index % 7;
        const row = Math.floor(index / 7);
        const x = startX + col * (cellW + gap);
        const y = startY + 10 + row * (cellH + gap);
        const key = formatBancoDateISO(date);
        const totalDia = pagosDia.reduce((sum, p) => sum + p.valor_num, 0);
        const hasMoroso = pagosDia.some(p => p.estado_reporte === 'MOROSO');
        const hasPendiente = pagosDia.some(p => p.estado_reporte === 'PENDIENTE');
        const hasPagado = pagosDia.some(p => p.estado_reporte === 'PAGADO');

        if (isNextMonth) doc.setFillColor(227, 242, 253);
        else if (hasMoroso) doc.setFillColor(254, 226, 226);
        else if (hasPendiente) doc.setFillColor(254, 243, 199);
        else if (hasPagado) doc.setFillColor(220, 252, 231);
        else doc.setFillColor(250, 250, 250);

        if (isNextMonth) doc.setDrawColor(25, 118, 210);
        else doc.setDrawColor(key === todayISO ? 11 : 226, key === todayISO ? 78 : 232, key === todayISO ? 50 : 240);
        doc.rect(x, y, cellW, cellH, 'FD');

        doc.setTextColor(isNextMonth ? 25 : 15, isNextMonth ? 118 : 23, isNextMonth ? 210 : 42);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(String(dayLabel), x + 3, y + 5);

        if (pagosDia.length) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(51, 65, 85);
            doc.text(isNextMonth ? 'Proximo' : `${pagosDia.length} pagos`, x + 3, y + 10);
            doc.text(formatBancoMoney(totalDia), x + 3, y + 14.5, { maxWidth: cellW - 5 });
            const statusText = hasMoroso ? 'Mora' : hasPendiente ? 'Pend.' : 'Pagado';
            doc.text(statusText, x + 3, y + 19);

            pagosDia.slice(0, 3).forEach((pago, logoIndex) => {
                const logo = pdfImages.bankLogos?.[pago.logo_url];
                const logoX = x + cellW - 5 - (logoIndex * 5);
                if (logo) {
                    addBancoPdfImage(doc, logo, logoX, y + cellH - 6, 4, 4);
                }
            });
        }
    };

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(period.year, period.month, day);
        const key = formatBancoDateISO(date);
        renderCalendarCell(offset + day - 1, date, day, calendarPayments[key] || []);
    }

    const nextDate = new Date(period.year, period.month + 1, 1);
    const nextKey = formatBancoDateISO(nextDate);
    const nextPayments = calendarPayments[nextKey] || [];
    if (nextPayments.length) {
        renderCalendarCell(offset + daysInMonth, nextDate, '1+', nextPayments, true);
    }

    const legendY = 270;
    [
        ['Pagado', [220, 252, 231]],
        ['Pendiente', [254, 243, 199]],
        ['Moroso', [254, 226, 226]]
    ].forEach((item, idx) => {
        const x = 14 + idx * 52;
        doc.setFillColor(item[1][0], item[1][1], item[1][2]);
        doc.rect(x, legendY, 6, 6, 'F');
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8);
        doc.text(item[0], x + 9, legendY + 5);
    });
}

async function fetchBancoMonthlyReportData() {
    const supabase = window.getSupabaseClient();
    const period = getBancoMonthlyReportPeriod(new Date());

    const { data: detalles, error: detallesError } = await supabase
        .from('ic_situacion_bancaria_detalle')
        .select('*')
        .gte('fecha_pago', period.startISO)
        .lte('fecha_pago', period.endISO)
        .order('fecha_pago', { ascending: true });

    if (detallesError) throw detallesError;

    const transaccionIds = [...new Set((detalles || []).map(p => p.transaccion).filter(Boolean))];
    if (!transaccionIds.length) return { pagos: [], period };

    const { data: bancosInfo, error: bancosError } = await supabase
        .from('ic_situacion_bancaria')
        .select('id_transaccion, nombre_banco, tipo_transaccion, estado, a_nombre_de, logo_banco')
        .in('id_transaccion', transaccionIds);

    if (bancosError) throw bancosError;

    const bancosMap = {};
    (bancosInfo || []).forEach(banco => {
        bancosMap[banco.id_transaccion] = banco;
    });

    const pagos = (detalles || [])
        .map(pago => normalizeBancoMonthlyPayment(pago, bancosMap[pago.transaccion]))
        .filter(pago => {
            const banco = bancosMap[pago.transaccion];
            const tipo = String(banco?.tipo_transaccion || '').toUpperCase();
            const fechaPago = pago.fecha_obj ? formatBancoDateISO(pago.fecha_obj) : '';
            const isCurrentMonthFirstDay = fechaPago === period.startISO;
            return banco?.estado === 'ACTIVO'
                && (tipo === 'CREDITO' || tipo === 'CRÉDITO')
                && !isCurrentMonthFirstDay;
        });

    return { pagos, period };
}

async function buildBancoPaymentsPdfBase64(pagos, period) {
    if (!window.jspdf?.jsPDF) throw new Error('jsPDF no esta disponible para generar el PDF.');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pdfImages = await loadBancoPdfImages(pagos);
    const generatedAt = new Date().toLocaleString('es-EC', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const summary = calculateBancoPaymentSummary(pagos);

    addBancoReportHeader(doc, period, summary, generatedAt, pdfImages);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(11, 78, 50);
    doc.text('Analisis del calendario de pagos', 14, 92);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(51, 65, 85);
    const analysisLines = doc.splitTextToSize(buildBancoWeekendAnalysis(pagos), 182);
    doc.text(analysisLines, 14, 100);

    const tableRows = pagos.map(pago => ({
        banco: pago.banco,
        titular: pago.a_nombre_de,
        fecha: pago.fecha_obj ? pago.fecha_obj.toLocaleDateString('es-EC') : pago.fecha_pago,
        valor: formatBancoMoney(pago.valor_num),
        estado: pago.estado_reporte,
        logo_url: pago.logo_url
    }));

    const tableStartY = Math.min(122, 110 + (analysisLines.length * 4));
    addBancoPaymentsManualTable(doc, tableRows, tableStartY, pdfImages);

    addBancoCalendarPage(doc, pagos, period, pdfImages);

    const buffer = doc.output('arraybuffer');
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary);
}

async function enviarPdfPagosBancosAJose() {
    const btn = document.getElementById('btn-enviar-pdf-pagos-bancos');
    const originalHtml = btn?.innerHTML;

    try {
        const confirm = await Swal.fire({
            title: 'Enviar PDF de pagos',
            text: 'Se generara el reporte actualizado del mes actual mas el dia 1 del mes siguiente y se enviara a Jose.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Enviar PDF',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0b4e32'
        });

        if (!confirm.isConfirmed) return;

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span class="desktop-only">Enviando...</span>';
        }
        if (typeof window.enableLoader === 'function') window.enableLoader();
        window.showLoader?.('Consultando pagos bancarios...');

        const { pagos, period } = await fetchBancoMonthlyReportData();
        if (!pagos.length) {
            throw new Error(`No hay obligaciones bancarias activas entre ${period.reportStartISO} y ${period.endISO}.`);
        }

        window.showLoader?.('Generando PDF en base64...');
        const pdfBase64 = await buildBancoPaymentsPdfBase64(pagos, period);
        const pdfInspection = inspectBancoPdfBase64(pdfBase64);
        console.info('[BANCOS] Validacion PDF pagos:', {
            valid: pdfInspection.valid,
            sizeBytes: pdfInspection.sizeBytes,
            base64Length: pdfInspection.cleanBase64.length,
            reason: pdfInspection.reason
        });

        if (!pdfInspection.valid) {
            throw new Error(`No se envio el mensaje porque el PDF no es valido: ${pdfInspection.reason}`);
        }
        const pdfPayloadBase64 = pdfInspection.cleanBase64;
        const fileName = `Pagos_a_bancos_${period.monthName}_${period.year}.pdf`.replace(/\s+/g, '_');
        const summary = calculateBancoPaymentSummary(pagos);

        const message = `JOSÉ KLEVER NISHVE CORO\n\n📄 Reporte actualizado de pagos bancarios ${period.monthName} ${period.year}.\n\nIncluye obligaciones del mes actual y el dia 1 del mes siguiente.\n\nTotal programado: ${formatBancoMoney(summary.totalProgramado)}\nPagado: ${formatBancoMoney(summary.amounts.PAGADO)} (${summary.counts.PAGADO || 0})\nPendiente: ${formatBancoMoney(summary.amounts.PENDIENTE)} (${summary.counts.PENDIENTE || 0})\nMoroso: ${formatBancoMoney(summary.amounts.MOROSO)} (${summary.counts.MOROSO || 0})\nTotal no pagado: ${formatBancoMoney(summary.totalNoPagado)}\nTotal para ponerse al día: ${formatBancoMoney(summary.totalPonerseAlDia)}`;

        window.__ultimoPdfBancos = {
            data: pdfPayloadBase64,
            sizeBytes: pdfInspection.sizeBytes,
            base64Length: pdfPayloadBase64.length,
            fileName,
            generatedAt: new Date().toISOString()
        };

        window.showLoader?.('Enviando PDF a Jose...');
        const result = await sendBancoPdfNotificationWebhook({
            whatsapp: '19175309618',
            data: pdfPayloadBase64,
            mime_type: 'application/pdf',
            size_bytes: pdfInspection.sizeBytes,
            base64_length: pdfPayloadBase64.length,
            filename: fileName,
            message,
            module: 'situacion_bancaria_pc',
            report_type: 'pagos_bancos',
            period_start: period.reportStartISO,
            period_end: period.endISO
        });

        if (!result.success) {
            throw new Error(result.error || 'No se pudo confirmar el envio del PDF.');
        }

        await window.showAlert('El PDF de pagos bancarios fue enviado a José correctamente.', 'PDF enviado', 'success');
    } catch (error) {
        console.error('Error enviando PDF de pagos bancarios:', error);
        await window.showFinancialError?.(error, 'No se pudo enviar el PDF de pagos bancarios.')
            || window.showAlert(error.message, 'Error', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml || '<i class="fas fa-paper-plane"></i> <span class="desktop-only">Enviar PDF de pagos</span>';
        }
        window.hideLoader?.();
        if (typeof window.disableLoader === 'function') window.disableLoader();
    }
}

/**
 * Genera el reporte PDF de todos los pagos bancarios del mes actual
 */
/**
 * Genera el reporte PDF de pagos (Solicita fecha, corrige error de tipo fecha)
 */
async function generateMonthlyPaymentsReport() {
    try {
        const { value: formValues } = await Swal.fire({
            title: 'Reporte de Pagos',
            width: '500px',
            background: '#1a1f26',
            color: '#ffffff',
            customClass: {
                popup: 'premium-dark-swal'
            },
            html: `
                <div class="export-options-container" style="text-align: left; padding: 10px 5px;">
                    <!-- Selector de Modo (Slider) -->
                    <div class="report-mode-selector">
                        <button type="button" class="report-mode-btn active" data-mode="month" id="btn-mode-month">
                            <i class="fas fa-calendar-alt"></i> POR MES
                        </button>
                        <button type="button" class="report-mode-btn" data-mode="range" id="btn-mode-range">
                            <i class="fas fa-calendar-day"></i> RANGO
                        </button>
                    </div>

                    <p id="export-mode-desc" style="margin-bottom: 20px; color: #94a3b8; font-size: 0.9rem; text-align: center;">
                        Seleccione el mes para el reporte consolidado.
                    </p>
                    
                    <!-- Sección MENSUAL -->
                    <div id="container-month" class="mode-container">
                        <div class="filter-group-corporate">
                            <label class="export-label-corporate">
                                <i class="fas fa-check-circle" style="margin-right: 8px; color: #F2BB3A;"></i>Seleccione Mes
                            </label>
                            <input type="month" id="swal-month" class="premium-input-swal" value="${new Date().toISOString().substring(0, 7)}">
                        </div>
                    </div>

                    <!-- Sección RANGO (Oculta) -->
                    <div id="container-range" class="mode-container hidden">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div class="filter-group-corporate">
                                <label class="export-label-corporate">Desde</label>
                                <input type="date" id="swal-start" class="premium-input-swal">
                            </div>
                            <div class="filter-group-corporate">
                                <label class="export-label-corporate">Hasta</label>
                                <input type="date" id="swal-end" class="premium-input-swal">
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    .premium-dark-swal {
                        border-radius: 1.5rem !important;
                        border: 1px solid rgba(255, 255, 255, 0.1) !important;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.5) !important;
                    }

                    .report-mode-selector {
                        display: flex;
                        background: #0f172a;
                        border-radius: 12px;
                        padding: 5px;
                        margin-bottom: 25px;
                        border: 1px solid rgba(255, 255, 255, 0.05);
                    }

                    .report-mode-btn {
                        flex: 1;
                        padding: 12px 15px;
                        border: none;
                        background: transparent;
                        color: #94a3b8;
                        font-size: 0.85rem;
                        font-weight: 800;
                        cursor: pointer;
                        border-radius: 10px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                    }

                    .report-mode-btn.active {
                        color: #ffffff;
                        background: #10b981; 
                        box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);
                    }

                    .export-label-corporate {
                        display: flex; 
                        align-items: center;
                        font-weight: 800; 
                        margin-bottom: 12px; 
                        color: #10b981;
                        font-size: 0.75rem;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }

                    .filter-group-corporate {
                        background: rgba(255, 255, 255, 0.03);
                        padding: 15px;
                        border-radius: 14px;
                        border: 1px solid rgba(255, 255, 255, 0.08);
                    }

                    .premium-input-swal {
                        width: 100%;
                        padding: 12px;
                        border-radius: 10px;
                        border: 1px solid rgba(255, 255, 255, 0.1);
                        font-family: inherit;
                        font-size: 1rem;
                        color: #ffffff;
                        outline: none;
                        transition: all 0.2s;
                        background: #0f172a;
                    }

                    .premium-input-swal:focus {
                        border-color: #10b981;
                        background: #1e2631;
                        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
                    }

                    .hidden { display: none; }
                </style>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-file-pdf" style="margin-right: 8px;"></i>Generar PDF',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#065f46',
            cancelButtonColor: '#334155',
            focusConfirm: false,
            didOpen: () => {
                // Apply border radius manually via style if class isn't enough
                Swal.getPopup().style.borderRadius = '1.25rem';

                const btnMonth = Swal.getHtmlContainer().querySelector('#btn-mode-month');
                const btnRange = Swal.getHtmlContainer().querySelector('#btn-mode-range');
                const containerMonth = Swal.getHtmlContainer().querySelector('#container-month');
                const containerRange = Swal.getHtmlContainer().querySelector('#container-range');
                const desc = Swal.getHtmlContainer().querySelector('#export-mode-desc');

                btnMonth.addEventListener('click', () => {
                    btnMonth.classList.add('active');
                    btnRange.classList.remove('active');
                    containerMonth.classList.remove('hidden');
                    containerRange.classList.add('hidden');
                    desc.textContent = 'Seleccione el mes para el reporte consolidado.';
                });

                btnRange.addEventListener('click', () => {
                    btnRange.classList.add('active');
                    btnMonth.classList.remove('active');
                    containerRange.classList.remove('hidden');
                    containerMonth.classList.add('hidden');
                    desc.textContent = 'Defina un rango de fechas personalizado.';
                });
            },
            preConfirm: () => {
                const isRange = Swal.getHtmlContainer().querySelector('#btn-mode-range').classList.contains('active');
                if (isRange) {
                    const start = document.getElementById('swal-start').value;
                    const end = document.getElementById('swal-end').value;
                    if (!start || !end) {
                        Swal.showValidationMessage('Por favor seleccione ambas fechas');
                        return false;
                    }
                    return { type: 'range', start, end };
                } else {
                    const month = document.getElementById('swal-month').value;
                    if (!month) {
                        Swal.showValidationMessage('Por favor seleccione el mes');
                        return false;
                    }
                    return { type: 'month', month };
                }
            }
        });

        if (!formValues) return;

        let startDate, endDate, titlePeriod;

        if (formValues.type === 'month') {
            const [year, month] = formValues.month.split('-');
            startDate = `${year}-${month}-01`;
            endDate = `${year}-${month}-${new Date(year, month, 0).getDate()}`;
            const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
            titlePeriod = `REPORTE DE PAGOS: ${monthNames[parseInt(month) - 1]} ${year}`;
        } else {
            startDate = formValues.start;
            endDate = formValues.end;
            titlePeriod = `DESDE ${startDate} HASTA ${endDate}`;
        }

        if (typeof window.enableLoader === 'function') window.enableLoader();
        window.showLoader(`Generando reporte PDF...`);

        const { jsPDF } = window.jspdf;
        // Explicitly set A4 Portrait (210mm x 297mm)
        const doc = new jsPDF('p', 'mm', 'a4');
        const supabase = window.getSupabaseClient();

        // Fetch payments for the period (Step 1)
        const { data: pagosRaw, error: errorPagos } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .select('*')
            .eq('estado', 'PAGADO')
            .gte('fecha_pagado', startDate)
            .lte('fecha_pagado', endDate)
            .order('fecha_pagado', { ascending: true });

        if (errorPagos) throw errorPagos;
        if (!pagosRaw || pagosRaw.length === 0) throw new Error(`No hay pagos registrados entre ${startDate} y ${endDate} para generar el reporte.`);

        // Get unique transaction IDs (Step 2)
        const transaccionIds = [...new Set(pagosRaw.map(p => p.transaccion))];

        // Fetch bank names and debtors for these transitions (Step 3)
        const { data: bancosInfo, error: errorBancos } = await supabase
            .from('ic_situacion_bancaria')
            .select('id_transaccion, nombre_banco, a_nombre_de')
            .in('id_transaccion', transaccionIds);

        if (errorBancos) throw errorBancos;

        // Create a map for easy access
        const bancosMap = {};
        (bancosInfo || []).forEach(b => {
            bancosMap[b.id_transaccion] = b;
        });

        // Enrich payments with bank info (Mapping)
        const pagos = pagosRaw.map(p => ({
            ...p,
            ic_situacion_bancaria: bancosMap[p.transaccion] || { nombre_banco: 'Banco', a_nombre_de: 'N/A' }
        }));

        // Generate PDF content
        let yPos = 20;
        const pageHeight = 297; // A4 Height in mm
        const marginBottom = 20;

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

        // Header Global Matching Credits Key Styles
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50); // Verde INKA #0B4E32
        doc.text("INKA CORP", 38, 18);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139); // Slate 500
        doc.text("REPORTE DE ESTADO DE PAGOS BANCARIOS", 38, 24);

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // Slate 400
        doc.text(`Generado: ${dateStr} | ${timeStr}`, 148, 18);
        doc.text(`Total registros: ${pagos.length}`, 148, 23);

        // Sub-info TitlePeriod
        yPos = 34;
        doc.setFontSize(9);
        doc.setTextColor(11, 78, 50); // Verde Inka
        doc.setFont('helvetica', 'bold');
        doc.text(`PERIODO: ${titlePeriod}`, 15, yPos);

        // Línea divisoria decorativa (Gold)
        yPos += 2;
        doc.setDrawColor(242, 187, 58); // Dorado #F2BB3A
        doc.setLineWidth(0.5);
        doc.line(15, yPos, 195, yPos);

        yPos += 10;

        // Loop through payments
        let count = 0;
        const total = pagos.length;

        for (const pago of pagos) {
            count++;
            window.showLoader(`Procesando comprobante ${count} de ${total}...`);

            const boxHeight = 90; // Approx height for each entry

            // Check page break: If explicit box height exceeds printable area
            if (yPos + boxHeight > (pageHeight - marginBottom)) {
                doc.addPage();
                yPos = 20; // Reset to top margin
            }

            // Draw Box Border
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.5);
            doc.roundedRect(15, yPos, 180, boxHeight, 3, 3);

            // Left Column: Details
            const bancoName = pago.ic_situacion_bancaria?.nombre_banco || 'Banco';
            const deudor = pago.ic_situacion_bancaria?.a_nombre_de || 'N/A';
            const valor = parseFloat(pago.valor || 0).toFixed(2);
            const fecha = pago.fecha_pagado;
            const refFoto = pago.fotografia ? pago.fotografia.split('/').pop() : 'Sin imagen';

            let textY = yPos + 10;
            const leftMargin = 20;
            const maxTextWidth = 60; // Reduced to 60 to prevent overlap with image at x=110

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);

            doc.text(`ENTIDAD:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal'); // Normal for value
            // Split text if too long
            const bancoLines = doc.splitTextToSize(bancoName, maxTextWidth);
            doc.text(bancoLines, leftMargin + 25, textY);
            textY += (bancoLines.length * 5) + 2;

            doc.setFont('helvetica', 'bold');
            doc.text(`DEUDOR:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            const deudorLines = doc.splitTextToSize(deudor, maxTextWidth);
            doc.text(deudorLines, leftMargin + 25, textY);
            textY += (deudorLines.length * 5) + 2;

            doc.setFont('helvetica', 'bold');
            doc.text(`VALOR PAGADO:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.text(`$${valor}`, leftMargin + 28, textY);

            textY += 6;
            doc.setFont('helvetica', 'bold');
            doc.text(`FECHA PAGO:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${fecha}`, leftMargin + 25, textY);

            // Removing Ref. Fotografía text as requested
            /*
            textY += 10;
            doc.setFontSize(8);
            doc.setTextColor(100);
            doc.text(`Ref. Fotografía:`, leftMargin, textY);
            textY += 4;
            // Truncate long ref filenames or wrap
            doc.text(`${refFoto}`, leftMargin, textY, { maxWidth: 80 });
            doc.setTextColor(0);
            */

            // Right Column: Image
            if (pago.fotografia) {
                try {
                    // Load image
                    const imgData = await fetchImageAsBase64(pago.fotografia);
                    if (imgData) {
                        // Fit image in right box: x=110, y=yPos+5, w=80, h=80
                        // Use 'keepAspect' mostly, but we fit in box
                        doc.addImage(imgData, 'JPEG', 110, yPos + 5, 80, 80, undefined, 'FAST');
                    }
                } catch (imgErr) {
                    console.error('Error loading image for PDF:', imgErr);
                    doc.text("[Error cargando imagen]", 130, yPos + 40);
                }
            } else {
                doc.text("[Sin Comprobante]", 130, yPos + 40);
            }

            yPos += boxHeight + 10; // Space + Gap
        }

        doc.save(`Estado_Pagos_Bancos_${titlePeriod.replace(/ /g, '_')}.pdf`);

        await window.showAlert('El reporte PDF se ha generado y descargado correctamente.', 'Reporte Listo', 'success');

    } catch (error) {
        console.error('Error generando reporte:', error);
        window.showAlert('Error al generar reporte: ' + error.message, 'Error', 'error');
    } finally {
        window.hideLoader();
        if (typeof window.disableLoader === 'function') window.disableLoader();
    }
}

/**
 * Helper to fetch image and convert to Base64 (using canvas or fetch)
 */
/**
 * Helper to fetch image and convert to Base64 (using canvas or fetch)
 * Automatically fixes "Drive" or damaged URLs (removes $)
 */
async function fetchImageAsBase64(url) {
    if (!url) return null;

    // 1. Fix user-reported issue: Remove '$' sign if strictly in the /d/$ID format
    // e.g. https://lh3.../d/$123 -> https://lh3.../d/123
    let cleanUrl = url.replace('/d/$', '/d/');

    // 2. Convert Standard Drive View Links to Direct Image links
    // Format 1: drive.google.com/file/d/ID/view
    // Format 2: drive.google.com/open?id=ID
    const driveRegex = /file\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/;
    const match = cleanUrl.match(driveRegex);

    if (match) {
        const fileId = match[1] || match[2];
        if (fileId) {
            cleanUrl = `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
        }
    }

    try {
        const response = await fetch(cleanUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const blob = await response.blob();
        if (blob.type.includes('html')) return null; // Drive sometimes returns login page as HTML

        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.warn('Could not fetch image for PDF (CORS? or Invalid URL):', cleanUrl, e);
        return null;
    }
}

/**
 * Carga la tabla de amortización filtrada por transacción
 */
async function loadAmortizacionBanco(idTransaccion) {
    const tableBody = document.getElementById('tabla-amortizacion-banco');
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center">Cargando pagos...</td></tr>';

    try {
        const supabase = window.getSupabaseClient();
        const { data: detalles, error } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .select('*')
            .eq('transaccion', idTransaccion)
            .order('cuota', { ascending: true });

        if (error) throw error;

        bancosDetalleData = detalles || [];
        renderAmortizacionTable(bancosDetalleData);
        updateAmortizacionProgress(bancosDetalleData);

    } catch (error) {
        console.error('Error al cargar detalle de banco:', error);
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red">Error al cargar datos</td></tr>';
    }
}

/**
 * Renderiza las filas de la tabla de amortización
 */
function renderAmortizacionTable(data) {
    const tableBody = document.getElementById('tabla-amortizacion-banco');
    tableBody.innerHTML = '';

    data.forEach(item => {
        const tr = document.createElement('tr');
        const isPaid = item.estado === 'PAGADO';
        if (isPaid) tr.classList.add('paid');

        tr.onclick = () => handleRowClick(item);

        tr.innerHTML = `
            <td>${item.cuota}</td>
            <td>${item.fecha_pago}</td>
            <td>$${parseFloat(item.valor || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</td>
            <td>
                <span class="status-pill ${item.estado.toLowerCase()}">
                    ${item.estado}
                </span>
            </td>
        `;
        tableBody.appendChild(tr);
    });
}

/**
 * Maneja el click en una fila de la tabla
 */
function handleRowClick(item) {
    if (item.estado === 'PAGADO') {
        showComprobanteViewer(item);
    } else {
        openPagoBancoModal(item);
    }
}

/**
 * Abre el modal para registrar un pago
 */
function openPagoBancoModal(item) {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('PAGO DE CUOTA BANCARIA')) {
            return;
        }
    }

    currentBancoDetalle = item;

    document.getElementById('pago-banco-id-detalle').value = item.id_detalle;
    document.getElementById('pago-banco-cuota-num').textContent = item.cuota;
    document.getElementById('pago-banco-valor').value = item.valor;
    document.getElementById('pago-banco-comentario').value = item.comentario || '';

    // Set default date to today
    document.getElementById('pago-banco-fecha').value = new Date().toISOString().split('T')[0];

    clearBancoPreview();
    document.getElementById('modal-pago-banco').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Muestra el comprobante ya pagado
 */
function showComprobanteViewer(item) {
    document.getElementById('viewer-img-banco').src = item.fotografia || 'img/no-image.png';
    document.getElementById('viewer-fecha-banco').textContent = item.fecha_pagado || 'N/A';
    const comentario = (item.comentario || '').trim();
    const comentarioRow = document.getElementById('viewer-comentario-banco-row');
    document.getElementById('viewer-comentario-banco').textContent = comentario;
    comentarioRow.classList.toggle('hidden', !comentario);
    document.getElementById('modal-comprobante-banco').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Actualiza el progreso en el modal de detalle
 */
function updateAmortizacionProgress(data) {
    const total = data.length;
    const pagados = data.filter(i => i.estado === 'PAGADO').length;
    const pct = total > 0 ? Math.round((pagados / total) * 100) : 0;

    // Si estamos en la vista de historial y el banco actual está ARCHIVADO, forzar visualización al 100%
    const currentBanco = bancosData.find(b => b.id_transaccion === currentBancoId);
    const isArchived = showingArchived && (currentBanco?.estado || '').toUpperCase() === 'ARCHIVADO';

    const displayPagados = isArchived ? total : pagados;
    const displayPct = isArchived ? 100 : pct;

    document.getElementById('det-banco-progreso-text').textContent = `${displayPagados} de ${total} cuotas`;
    document.getElementById('det-banco-progreso-pct').textContent = `${displayPct}%`;
    document.getElementById('det-banco-barra').style.width = `${displayPct}%`;

    const totalPagado = data
        .filter(i => i.estado === 'PAGADO')
        .reduce((sum, i) => sum + parseFloat(i.valor || 0), 0);

    const totalPendiente = data
        .filter(i => i.estado !== 'PAGADO')
        .reduce((sum, i) => sum + parseFloat(i.valor || 0), 0);

    const displayTotalPagado = isArchived ? (totalPagado + totalPendiente) : totalPagado;
    const displayTotalPendiente = isArchived ? 0 : totalPendiente;

    document.getElementById('det-banco-pagado').textContent = '$' + displayTotalPagado.toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('det-banco-pendiente').textContent = '$' + displayTotalPendiente.toLocaleString('es-EC', { minimumFractionDigits: 2 });

    // Ocultar botón de precancelar si ya está pagado al 100%
    const btnPrecancelar = document.getElementById('btn-precancelar-banco');
    if (btnPrecancelar) {
        if (pct >= 100) {
            btnPrecancelar.classList.add('hidden');
        } else {
            btnPrecancelar.classList.remove('hidden');
        }
    }
}

/**
 * Cierra todos los modales premium abiertos
 */
function closePremiumModals() {
    document.querySelectorAll('.modal-premium').forEach(m => m.classList.add('hidden'));
    document.body.classList.remove('modal-open');
}

/**
 * Maneja el envío del formulario de pago
 */
async function handleBancoPaymentSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-guardar-pago-banco');

    const idDetalle = document.getElementById('pago-banco-id-detalle').value;
    const fecha = document.getElementById('pago-banco-fecha').value;
    const previewImg = document.getElementById('pago-banco-preview');
    const montoPagado = parseFloat(document.getElementById('pago-banco-valor').value) || parseFloat(currentBancoDetalle?.valor || 0) || 0;
    const comentario = document.getElementById('pago-banco-comentario').value.trim();

    if (!currentBancoReceiptFile || !previewImg.src || previewImg.src.includes('data:image/gif')) {
        return window.showAlert('Por favor sube o toma una foto del comprobante', 'Comprobante requerido', 'warning');
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const supabase = window.getSupabaseClient();

        // 1. Subir imagen a Storage usando la utilidad centralizada
        const uploadRes = await window.uploadFileToStorage(currentBancoReceiptFile, 'bancos/pagos', idDetalle, 'inkacorp');

        if (!uploadRes.success) {
            throw new Error(uploadRes.error);
        }

        const imgUrl = uploadRes.url;

        // 2. Actualizar registro en DB
        const { error: updateError } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .update({
                estado: 'PAGADO',
                fecha_pagado: fecha,
                fotografia: imgUrl,
                comentario: comentario || null
            })
            .eq('id_detalle', idDetalle);

        if (updateError) throw updateError;

        const banco = (bancosData || []).find(b => b.id_transaccion === currentBancoId);
        let joseWebhookResult = { success: false };

        try {
            const ownerWebhookResult = await sendBancoNotificationWebhook({
                whatsapp: '19175309618',
                image_base64: imgUrl,
                message: buildBancoPaymentOwnerMessage(
                    banco,
                    currentBancoDetalle,
                    montoPagado,
                    fecha,
                    formatBancoNotificationTimestamp(),
                    imgUrl,
                    comentario
                )
            });
            joseWebhookResult = ownerWebhookResult;

            if (!ownerWebhookResult.success) {
                console.warn('[BANCOS] No se pudo enviar webhook de notificación:', ownerWebhookResult.error);
            }
        } catch (webhookError) {
            console.warn('[BANCOS] Error enviando webhook bancario:', webhookError);
        }

        try {
            const loggedUser = await getLoggedBancoNotificationUser(supabase);
            const shouldNotifyLoggedUser = loggedUser?.whatsapp
                && normalizeBancoWhatsapp(loggedUser.whatsapp) !== normalizeBancoWhatsapp('19175309618');

            if (shouldNotifyLoggedUser) {
                const loggedUserWebhookResult = await sendBancoNotificationWebhook({
                    whatsapp: loggedUser.whatsapp,
                    image_base64: imgUrl,
                    message: buildBancoLoggedUserMessage(
                        loggedUser,
                        banco,
                        currentBancoDetalle,
                        montoPagado,
                        fecha,
                        joseWebhookResult.success,
                        comentario
                    )
                });

                if (!loggedUserWebhookResult.success) {
                    console.warn('[BANCOS] No se pudo notificar al usuario logeado:', loggedUserWebhookResult.error);
                }
            }
        } catch (loggedUserWebhookError) {
            console.warn('[BANCOS] Error notificando al usuario logeado:', loggedUserWebhookError);
        }

        closePremiumModals();
        const successMessage = joseWebhookResult.success
            ? 'El pago se ha registrado correctamente y José fue notificado.'
            : 'El pago se ha registrado correctamente, pero no se pudo confirmar la notificación a José.';
        await window.showAlert(successMessage, '¡Pago Exitoso!', 'success');

        // Recargar tabla de amortización para el banco actual
        if (currentBancoId) {
            await loadAmortizacionBanco(currentBancoId);
        }

        // Recargar grid principal en segundo plano (SILENT)
        loadBancosData(true);

    } catch (error) {
        console.error('Error al guardar pago:', error);
        await window.showFinancialError?.(error, 'No se pudo registrar el pago bancario.')
            || window.showAlert(error.message, 'Error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar Pago';
    }
}

/**
 * Maneja la carga de imagen y muestra el preview
 */
function handleBancoImageUpload(file) {
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        return window.showAlert('La imagen no debe pesar más de 5MB', 'Imagen muy grande', 'warning');
    }

    currentBancoReceiptFile = file;

    const container = document.getElementById('pago-banco-preview-container');
    const placeholder = document.getElementById('pago-banco-upload-placeholder');
    const img = document.getElementById('pago-banco-preview');

    const showPreview = (src) => {
        img.src = src;
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
    };

    if (typeof window.showImagePreview === 'function') {
        window.showImagePreview(file, img)
            .then(() => showPreview(img.src))
            .catch(() => {
                const reader = new FileReader();
                reader.onload = function (e) {
                    showPreview(e.target.result);
                };
                reader.readAsDataURL(file);
            });
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        showPreview(e.target.result);
    };
    reader.readAsDataURL(file);
}

/**
 * Limpia el preview de imagen
 */
function clearBancoPreview() {
    const container = document.getElementById('pago-banco-preview-container');
    const placeholder = document.getElementById('pago-banco-upload-placeholder');
    const img = document.getElementById('pago-banco-preview');

    currentBancoReceiptFile = null;

    img.src = '';
    container.classList.add('hidden');
    placeholder.classList.remove('hidden');
}

/**
 * Abre el modal de precancelación
 */
function openPrecancelarModal() {
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('PRECANCELACIÓN BANCARIA')) {
            return;
        }
    }

    if (!currentBancoId) return;

    // Calcular total pendiente real
    const totalPendiente = bancosDetalleData
        .filter(i => i.estado !== 'PAGADO')
        .reduce((sum, i) => sum + parseFloat(i.valor || 0), 0);

    document.getElementById('prepay-total-pendiente').value = '$' + totalPendiente.toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('prepay-valor').value = '';
    document.getElementById('prepay-saving-box').classList.add('hidden');

    clearPrepayPreview();
    document.getElementById('modal-precancelar-banco').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Calcula el ahorro en tiempo real
 */
function calculatePrepaySavings() {
    const totalPendiente = bancosDetalleData
        .filter(i => i.estado !== 'PAGADO')
        .reduce((sum, i) => sum + parseFloat(i.valor || 0), 0);

    const valorPagar = parseFloat(document.getElementById('prepay-valor').value) || 0;
    const savingBox = document.getElementById('prepay-saving-box');
    const savingText = document.getElementById('prepay-ahorro');

    if (valorPagar > 0 && valorPagar < totalPendiente) {
        const ahorro = totalPendiente - valorPagar;
        savingText.value = '$' + ahorro.toLocaleString('es-EC', { minimumFractionDigits: 2 });
        savingBox.classList.remove('hidden');
    } else {
        savingBox.classList.add('hidden');
    }
}

/**
 * Maneja la carga de imagen para precancelar
 */
function handlePrepayImageUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const container = document.getElementById('prepay-preview-container');
        const placeholder = document.getElementById('prepay-upload-placeholder');
        const img = document.getElementById('prepay-preview');
        img.src = e.target.result;
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}

/**
 * Limpia el preview de precancelar
 */
function clearPrepayPreview() {
    const container = document.getElementById('prepay-preview-container');
    const placeholder = document.getElementById('prepay-upload-placeholder');
    const img = document.getElementById('prepay-preview');
    img.src = '';
    container.classList.add('hidden');
    placeholder.classList.remove('hidden');
}

/**
 * Procesa la precancelación
 */
async function handlePrecancelarSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-registrar-precancelacion');
    const valorPagar = parseFloat(document.getElementById('prepay-valor').value);
    const previewImg = document.getElementById('prepay-preview');

    if (!previewImg.src || previewImg.src.includes('data:image/gif') || previewImg.src === '') {
        return window.showAlert('Por favor sube el comprobante de la precancelación', 'Comprobante requerido', 'warning');
    }

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';

        const supabase = window.getSupabaseClient();
        const pendingInstallments = bancosDetalleData.filter(i => i.estado !== 'PAGADO');

        if (pendingInstallments.length === 0) throw new Error('No hay cuotas pendientes para precancelar');

        // 1. Subir imagen usando la utilidad centralizada
        const blob = await fetch(previewImg.src).then(r => r.blob());
        const uploadRes = await window.uploadFileToStorage(blob, 'bancos_pagos', `prepay_${currentBancoId}`);
        
        if (!uploadRes.success) {
            throw new Error(uploadRes.error);
        }

        const imgUrl = uploadRes.url;

        // 2. Distribuir el pago en las cuotas pendientes
        // Para que las estadísticas cuadren, pondremos el valor proporcional pagado en cada cuota
        // o simplemente marcamos todas como pagadas con el valor que el usuario ingresó (prorrateado).
        const valorPorCuota = valorPagar / pendingInstallments.length;
        const idsPending = pendingInstallments.map(i => i.id_detalle);
        const hoy = new Date().toISOString().split('T')[0];

        const { error: updateError } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .update({
                estado: 'PAGADO',
                fecha_pagado: hoy,
                fotografia: imgUrl,
                valor: valorPorCuota // Actualizamos el valor al real pagado tras el descuento
            })
            .in('id_detalle', idsPending);

        if (updateError) throw updateError;

        // 3. Si se pagó todo, podrías archivar el crédito o dejar que el usuario lo haga
        // Por ahora refrescamos y cerramos
        closePremiumModals();
        await window.showAlert('La precancelación se ha procesado y registrado correctamente.', '¡Proceso Exitoso!', 'success');

        if (currentBancoId) {
            await loadAmortizacionBanco(currentBancoId);
        }
        loadBancosData();

    } catch (error) {
        console.error('Error al precancelar:', error);
        await window.showFinancialError?.(error, 'No se pudo registrar la precancelación bancaria.')
            || window.showAlert(error.message, 'Error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check-circle"></i> Registrar Precancelación';
    }
}

/**
 * Actualiza el logo de un banco
 */
async function handleBankLogoUpdate(file) {
    if (!file) return;
    if (!currentBancoId) return;

    try {
        // 1. Mostrar loading
        if (window.Swal) {
            Swal.fire({
                title: 'Subiendo logo...',
                text: 'Espere un momento mientras procesamos la imagen',
                allowOutsideClick: false,
                didOpen: () => { Swal.showLoading(); }
            });
        }

        // 2. Subir a carpeta 'nuevos bancos' en el bucket 'inkacorp'
        // uploadFileToStorage comprime automáticamente a webp si es imagen (image-utils.js)
        const uploadRes = await window.uploadFileToStorage(file, 'nuevos bancos', currentBancoId, 'inkacorp');
        
        if (!uploadRes.success) throw new Error(uploadRes.error);

        const newLogoUrl = uploadRes.url;

        // 3. Actualizar base de datos
        const supabase = window.getSupabaseClient();
        const { error: updateError } = await supabase
            .from('ic_situacion_bancaria')
            .update({ logo_banco: newLogoUrl })
            .eq('id_transaccion', currentBancoId);

        if (updateError) throw updateError;

        // 4. Actualizar UI en el modal
        const modalLogo = document.getElementById('modal-bank-logo');
        const modalIcon = document.getElementById('modal-bank-logo-icon');
        
        if (modalLogo) {
            modalLogo.src = newLogoUrl;
            modalLogo.classList.remove('hidden');
            if (modalIcon) modalIcon.classList.add('hidden');
            
            // Quitar zooms anteriores para el nuevo logo (mejor centrallizar)
            modalLogo.classList.remove('logo-zoom-max', 'logo-zoom-high', 'logo-zoom-low');
        }

        // Refrescar datos locales
        const bancoIdx = bancosData.findIndex(b => b.id_transaccion === currentBancoId);
        if (bancoIdx !== -1) {
            bancosData[bancoIdx].logo_banco = newLogoUrl;
            // Actualizar caché persistente si existe
            if (window.setCacheData) window.setCacheData('bancos', bancosData);
        }

        if (window.Swal) {
            Swal.fire({
                icon: 'success',
                title: 'Logo actualizado',
                text: 'El logo del banco ha sido actualizado correctamente.',
                timer: 2000,
                showConfirmButton: false
            });
        }

        // Renderizar de nuevo la grilla para refrescar las tarjetas
        if (window.currentPagosMap) {
            renderBancosCards(bancosData, window.currentPagosMap);
        }

    } catch (error) {
        console.error('Error al actualizar logo:', error);
        if (window.showAlert) {
            window.showAlert(error.message, 'Error al actualizar', 'error');
        }
    }
}

/**
 * Actualiza el nombre de un banco a través de un prompt
 */
async function handleBankNameUpdate() {
    if (!currentBancoId) return;
    const banco = bancosData.find(b => b.id_transaccion === currentBancoId);
    if (!banco) return;

    if (!window.Swal) {
        const newName = prompt('Editar Nombre de Banco:', banco.nombre_banco);
        if (newName && newName !== banco.nombre_banco) {
            processNameUpdate(newName);
        }
        return;
    }

    const { value: newName } = await Swal.fire({
        title: 'Editar Nombre de Banco',
        input: 'text',
        inputValue: banco.nombre_banco,
        showCancelButton: true,
        confirmButtonText: 'Guardar cambios',
        cancelButtonText: 'Cancelar',
        inputValidator: (value) => {
            if (!value) return 'El nombre no puede estar vacío';
        }
    });

    if (newName && newName !== banco.nombre_banco) {
        processNameUpdate(newName);
    }

    async function processNameUpdate(name) {
        try {
            if (window.Swal) Swal.showLoading();
            
            const supabase = window.getSupabaseClient();
            const { error: updateError } = await supabase
                .from('ic_situacion_bancaria')
                .update({ nombre_banco: name })
                .eq('id_transaccion', currentBancoId);

            if (updateError) throw updateError;

            // Actualizar UI
            document.getElementById('modal-bank-name').textContent = name;
            
            // Actualizar local
            banco.nombre_banco = name;
            if (window.setCacheData) window.setCacheData('bancos', bancosData);

            if (window.Swal) {
                Swal.fire({
                    icon: 'success',
                    title: 'Nombre actualizado',
                    timer: 1500,
                    showConfirmButton: false
                });
            }

            if (window.currentPagosMap) {
                renderBancosCards(bancosData, window.currentPagosMap);
            }
        } catch (error) {
            console.error('Error al actualizar nombre:', error);
            if (window.showAlert) window.showAlert(error.message, 'Error', 'error');
        }
    }
}

// Exponer funciones necesarias globalmente si se requiere
window.initBancosModule = initBancosModule;
// Need to expose deleteBanco globally
// Need to expose archiveBanco globally
window.archiveBanco = archiveBanco;

// =========================================================================
// NUEVA FUNCIONALIDAD: AGREGAR CRÉDITO/PÓLIZA
// =========================================================================

// Variables globales para la nueva funcionalidad
let bancosLogosList = [];

// Init extra listeners for new functionality
function setupNewBancoListeners() {
    const btnNew = document.getElementById('btn-nuevo-banco');
    if (btnNew) {
        btnNew.addEventListener('click', openNewBancoModal);
    }

    const btnSave = document.getElementById('btn-save-new-banco');
    if (btnSave) {
        btnSave.addEventListener('click', handleSaveNewBanco);
    }

    // Buscador de Bancos
    const searchInput = document.getElementById('new-banco-search');
    const listContainer = document.getElementById('banco-options-list');

    if (searchInput) {
        searchInput.addEventListener('focus', () => {
            listContainer.classList.remove('hidden');
        });

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const filtered = bancosLogosList.filter(b => b.bancos.toLowerCase().includes(val));
            renderBancoSearchOptions(filtered);
            listContainer.classList.remove('hidden');
        });
    }

    // Cerrar lista al hacer clic fuera
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#banco-search-container')) {
            if (listContainer) listContainer.classList.add('hidden');
        }
    });

    // Auto-calculo on input change
    const formInputs = document.querySelectorAll('#form-nuevo-banco input, #form-nuevo-banco select');
    formInputs.forEach(input => {
        // 'input' covers typing; 'change' ensures pickers/spinners/date inputs also refresh the preview
        input.addEventListener('input', updateBancoPreview);
        input.addEventListener('change', updateBancoPreview);
    });

    // Toggle fields based on type
    const typeSelect = document.getElementById('new-banco-tipo');
    if (typeSelect) {
        typeSelect.addEventListener('change', toggleBancoFields);
    }
}

// Hook into existing setup
const originalSetup = setupBancosEventListeners;
setupBancosEventListeners = function () {
    originalSetup();
    setupNewBancoListeners();
}

/**
 * Abre el modal de nuevo banco
 */
async function openNewBancoModal() {
    // Reset form
    document.getElementById('form-nuevo-banco').reset();
    
    // Reset Search Component
    const searchInput = document.getElementById('new-banco-search');
    const hiddenInput = document.getElementById('new-banco-nombre');
    if (searchInput) searchInput.value = '';
    if (hiddenInput) {
        hiddenInput.value = '';
        hiddenInput.dataset.logo = '';
    }

    // Load Banks List if empty
    if (bancosLogosList.length === 0) {
        await loadBancoLogos();
    } else {
        renderBancoSearchOptions(bancosLogosList);
    }
    document.getElementById('new-banco-fecha').value = new Date().toISOString().split('T')[0];

    // Reset UI state
    toggleBancoFields();
    updateBancoPreview();

    document.getElementById('modal-nuevo-banco').classList.remove('hidden');
    document.body.classList.add('modal-open');
}

/**
 * Carga la lista de bancos y logos para el select duplicado/buscable
 */
async function loadBancoLogos() {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_bancos_logos')
            .select('bancos, imagenes')
            .order('bancos', { ascending: true });

        if (error) throw error;

        // Sort: Banks with logos first
        bancosLogosList = (data || []).sort((a, b) => {
            const hasA = !!a.imagenes;
            const hasB = !!b.imagenes;
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            return a.bancos.localeCompare(b.bancos);
        });

        renderBancoSearchOptions(bancosLogosList);

    } catch (e) {
        console.error('Error cargando lista de bancos:', e);
    }
}

/**
 * Renderiza las opciones del buscador de bancos
 */
function renderBancoSearchOptions(list) {
    const listContainer = document.getElementById('banco-options-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    if (list.length === 0) {
        listContainer.innerHTML = '<div class="option-item">No se encontraron bancos</div>';
        return;
    }

    list.forEach(b => {
        const item = document.createElement('div');
        item.className = 'option-item';
        
        // Determinar si mostrar imagen o icono
        const logoHtml = b.imagenes 
            ? `<img src="${b.imagenes}" class="option-logo" alt="">`
            : `<div class="option-logo-placeholder"><i class="fas fa-university"></i></div>`;

        item.innerHTML = `
            ${logoHtml}
            <span class="option-text">${b.bancos}</span>
        `;
        item.onclick = () => selectBancoOption(b);
        listContainer.appendChild(item);
    });
}

/**
 * Selecciona un banco del buscador
 */
function selectBancoOption(bankObj) {
    const searchInput = document.getElementById('new-banco-search');
    const hiddenInput = document.getElementById('new-banco-nombre');
    const listContainer = document.getElementById('banco-options-list');

    searchInput.value = bankObj.bancos;
    hiddenInput.value = bankObj.bancos;
    hiddenInput.dataset.logo = bankObj.imagenes || '';
    
    listContainer.classList.add('hidden');
    
    // Disparar evento input para actualizar previsualización
    updateBancoPreview();
}

/**
 * Alterna campos según tipo (Crédito vs Póliza)
 */
function toggleBancoFields() {
    const type = document.getElementById('new-banco-tipo').value;
    const isCredito = type === 'CREDITO';

    // Labels
    document.getElementById('lbl-monto').textContent = isCredito ? 'Monto Solicitado' : 'Monto Depositado';

    // Visibility
    const groupPrimerPago = document.getElementById('group-primer-pago');
    const groupValorRecibir = document.getElementById('group-valor-recibir');

    if (isCredito) {
        groupPrimerPago.classList.remove('hidden');
        // Mostrar también el campo de cuota para créditos — el usuario puede sobreescribir la cuota calculada
        groupValorRecibir.classList.remove('hidden');
        document.getElementById('new-banco-primer-pago').required = true;
        document.getElementById('new-banco-valor-recibir').required = false;
    } else {
        groupPrimerPago.classList.add('hidden');
        groupValorRecibir.classList.remove('hidden');
        document.getElementById('new-banco-primer-pago').required = false;
        document.getElementById('new-banco-valor-recibir').required = true; // Maybe optional?
    }
}


/**
 * Actualiza la tarjeta de previsualización en tiempo real
 */
function updateBancoPreview() {
    // Get values
    const bancoName = document.getElementById('new-banco-nombre').value;
    const plazo = parseInt(document.getElementById('new-banco-plazo').value) || 0;
    const monto = parseFloat(document.getElementById('new-banco-monto').value) || 0;
    const interes = parseFloat(document.getElementById('new-banco-interes').value) || 0;
    const deudor = document.getElementById('new-banco-deudor').value || 'Nombre...';

    // Get Logo
    const hiddenInput = document.getElementById('new-banco-nombre');
    let logoUrl = hiddenInput ? hiddenInput.dataset.logo : '';

    // normalización para Pichincha
    if ((bancoName || '').toUpperCase().includes('PICHINCHA')) {
        logoUrl = 'https://lh3.googleusercontent.com/d/10zy2rxIR2dp_MfdGO7JiOjVvovGSIGCZ=w2048?name=Pichincha.png';
    }

    // Aplicar Colores del Banco a la Previsualización
    const theme = getBankTheme(bancoName);
    const previewCardElem = document.getElementById('new-banco-preview-card');
    if (previewCardElem) {
        previewCardElem.style.setProperty('--bank-bg', theme.bg);
        previewCardElem.style.setProperty('--bank-primary', theme.primary);
        previewCardElem.style.setProperty('--bank-light', theme.light);
        previewCardElem.style.setProperty('--bank-glow', theme.glow);
        previewCardElem.style.setProperty('--bank-border', theme.border);
        previewCardElem.style.setProperty('--bank-pill-text', theme.textOnPill);
    }

    // Calculations
    let cuota = 0;
    let total = parseFloat(document.getElementById('new-banco-total').value) || 0;
    const manualCuota = parseFloat(document.getElementById('new-banco-valor-recibir').value) || 0;

    // Si el usuario no ingresó 'total' pero sí puso monto/interés/plazo, estimar un Total a pagar
    // (fallback simple: capital + interés simple proporcional al plazo). Esto evita que la
    // tarjeta quede en $0.00 cuando el usuario sólo completa Monto/Interés/Plazo.
    if (total === 0 && monto > 0) {
        const periodicidad = (document.getElementById('new-banco-periodicidad') || {}).value || 'MENSUAL';
        // Interpretación conservadora: 'interes' es % anual; plazo viene en meses si periodicidad=MENSUAL
        const years = periodicidad.toUpperCase() === 'MENSUAL' ? (plazo / 12) : plazo;
        const interesTotal = (interes > 0 && years > 0) ? monto * (interes / 100) * years : 0;
        total = monto + interesTotal;
    }

    if (manualCuota > 0) {
        // El usuario suministró una cuota manual: usarla (override)
        cuota = manualCuota;
    } else if (plazo > 0 && total > 0) {
        // Calculate cuota based on current manual total
        cuota = total / plazo;
    }

    // Render Preview
    const cardFunc = (name, p, c, mot) => `
        <div class="bank-card-header">
            <span class="bank-name-label">${name || 'Banco'}</span>
            <div class="bank-progress-circle">0/${p}</div>
        </div>
        <div class="bank-card-progress">
            <div class="progress-label-group">
                <span>Progreso</span>
                <span class="progress-percentage">0%</span>
            </div>
            <div class="progress-bar-container">
                <div class="progress-bar-fill" style="width: 0%"></div>
            </div>
        </div>
        <div class="bank-card-amounts">
            <div class="amount-item">
                <span class="amount-label">Cuota</span>
                <span class="amount-value">$${cuota.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="amount-item">
                <span class="amount-label">Total</span>
                <span class="amount-value">$${total.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
            </div>
        </div>
        <div class="bank-card-footer">
            <span class="debtor-label">DEUDOR</span>
            <span class="debtor-name">${deudor}</span>
        </div>
        ${logoUrl 
            ? `<img src="${logoUrl}" class="bank-card-logo ${getLogoZoomClass(bancoName)}" alt="Logo">` 
            : `<div class="bank-card-logo-icon"><i class="fas fa-university"></i></div>`}
    `;

    document.getElementById('new-banco-preview-card').innerHTML = cardFunc(bancoName, plazo, cuota, '');
}

/**
 * Guarda el nuevo banco y genera la tabla
 */
async function handleSaveNewBanco() {
    const form = document.getElementById('form-nuevo-banco');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const btn = document.getElementById('btn-save-new-banco');

    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        // Gather Data
        const hiddenInput = document.getElementById('new-banco-nombre');
        const nombre_banco = hiddenInput.value;
        const logo_url = hiddenInput.dataset.logo || '';

        if (!nombre_banco) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Guardar y Crear';
            return window.showAlert('Por favor seleccione un banco de la lista', 'Banco requerido', 'warning');
        }

        const tipo = document.getElementById('new-banco-tipo').value;
        const monto = parseFloat(document.getElementById('new-banco-monto').value);
        const plazo = parseInt(document.getElementById('new-banco-plazo').value);
        const interes = parseFloat(document.getElementById('new-banco-interes').value);
        const total = parseFloat(document.getElementById('new-banco-total').value);
        const manualMensual = parseFloat(document.getElementById('new-banco-valor-recibir').value);
        const mensual = (manualMensual && manualMensual > 0) ? manualMensual : (plazo > 0 ? total / plazo : 0);

        const fecha = document.getElementById('new-banco-fecha').value;
        const primerPago = document.getElementById('new-banco-primer-pago').value;
        const deudor = document.getElementById('new-banco-deudor').value;
        const motivo = document.getElementById('new-banco-motivo').value;
        const valor_recibido = document.getElementById('new-banco-recibido').value || 0;
        const periodicidad = document.getElementById('new-banco-periodicidad')?.value || 'MENSUAL';

        const id_transaccion = `TRX-${Date.now()}`; // Generate unique ID

        const supabase = window.getSupabaseClient();

        // 1. Insert Header (ic_situacion_bancaria)
        // Build a safe payload: map local names -> DB column names and filter unknowns
        const _num = v => (v === '' || v === null || v === undefined) ? null : Number(String(v).replace(/[,\s]/g, ''));
        const _int = v => { const n = _num(v); return n == null ? null : Math.trunc(n); };

        const columnMap = {
            id_transaccion: id_transaccion,
            nombre_banco: nombre_banco,
            tipo_transaccion: tipo,           // mapped from `tipo`
            valor: _num(monto),               // Monto Solicitado
            valor_descontado: _num(monto) - _num(valor_recibido),
            monto_final: _num(total),
            plazo: _int(plazo),
            plazo_tipo: periodicidad,
            interes: _num(interes),
            mensual: _num(mensual),
            fecha_transaccion: fecha || null,
            primer_pago: primerPago || null,
            a_nombre_de: deudor || null,
            motivo: motivo || null,
            logo_banco: logo_url || null,
            estado: 'ACTIVO',
            contador: _int(plazo) // Total quotas
        };

        const payload = Object.fromEntries(
            Object.entries(columnMap).filter(([k, v]) => v !== undefined)
        );

        const { error: headerError } = await supabase
            .from('ic_situacion_bancaria')
            .insert(payload);

        if (headerError) throw headerError;

        // 2. Generate Amortization Table (ic_situacion_bancaria_detalle)
        const detalles = [];
        
        // Base date: Use primerPago if provided, otherwise the transaction date
        const baseDate = primerPago ? new Date(primerPago + 'T12:00:00') : new Date(fecha + 'T12:00:00');
        
        // If it's a policy and no primerPago was set, start next month
        if (!primerPago && tipo === 'POLIZA') {
            baseDate.setMonth(baseDate.getMonth() + 1);
        }

        for (let i = 1; i <= plazo; i++) {
            // Calculate date precisely to keep the same day
            const installmentDate = new Date(baseDate);
            installmentDate.setMonth(baseDate.getMonth() + (i - 1));
            
            detalles.push({
                id_detalle: `${id_transaccion}-C${i}`, // Custom text ID
                transaccion: id_transaccion,
                cuota: i,
                fecha_pago: installmentDate.toISOString().split('T')[0],
                valor: mensual,
                estado: 'PENDIENTE',
                fecha_pagado: null,
                fotografia: null
            });
        }

        const { error: detailError } = await supabase
            .from('ic_situacion_bancaria_detalle')
            .insert(detalles);

        if (detailError) throw detailError;

        // Success
        window.showToast('Registro creado exitosamente', 'success');
        document.getElementById('modal-nuevo-banco').classList.add('hidden');

        // Reload Stats and Grid
        loadBancosData(true);

    } catch (error) {
        console.error('Error guardando nuevo banco:', error);
        await window.showFinancialError?.(error, 'No se pudo guardar la transacción bancaria.')
            || window.showAlert('Error al guardar: ' + error.message, 'Error', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Guardar y Crear';
    }
}
