/**
 * INKA CORP MOBILE - Módulo Caja
 * Adaptación móvil del sistema de aperturas, cierres y movimientos operativos.
 */

const CAJA_TABLE = 'ic_caja_aperturas';
const MOVIMIENTOS_TABLE = 'ic_caja_movimientos';
const TRANSFERENCIAS_TABLE = 'ic_caja_transferencias';
const PENDING_MANUAL_MOVEMENTS_TABLE = 'ic_caja_movimientos_pendientes';
const CAJA_DIRECT_URL = 'https://administracion.inkacorp.net/?view=caja';
const TEXT_WEBHOOK_URL = 'https://lpn8nwebhook.luispintasolutions.com/webhook/mensajería_texto';
const CAJA_PROOF_COMPRESSION = {
    maxWidth: 1000,
    maxHeight: 1000,
    quality: 0.64,
    minQuality: 0.4,
    targetMaxBytes: 360 * 1024,
    mimeType: 'image/webp'
};

let currentCajaSession = null;
let currentBalance = 0;
let ingresosTurno = 0;
let egresosTurno = 0;
let transferPollingInterval = null;
let currentPendingTransfer = null;
let currentCajaProofSolicitudId = null;
let currentCajaProofFile = null;

/**
 * Inicialización del módulo - Requerido por mobile-app.js
 */
async function initCajaModule() {
    try {
        console.log('[MOBILE-CAJA] Inicializando módulo de Caja...');
        setupDateFilters();
        await checkCajaStatus();
        await loadCajaData();
        await loadCajaPendingManualRequestsMobile();
        
        // Iniciar polling de transferencias entrantes
        startTransferPolling();
    } catch (error) {
        console.error("[MOBILE-CAJA] Error inicializando módulo:", error);
    }
}

function startTransferPolling() {
    if (transferPollingInterval) clearInterval(transferPollingInterval);
    checkPendingTransfersMobile();
    transferPollingInterval = setInterval(checkPendingTransfersMobile, 10000); // Cada 10 seg
}

function setupDateFilters() {
    const today = new Date();
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(today.getDate() - 2);

    const inputInicio = document.getElementById('filter-caja-inicio');
    const inputFin = document.getElementById('filter-caja-fin');

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (inputInicio && !inputInicio.value) inputInicio.value = formatDate(threeDaysAgo);
    if (inputFin && !inputFin.value) inputFin.value = formatDate(today);

    // Event listeners para filtros
    if (inputInicio) inputInicio.onchange = () => loadCajaData();
    if (inputFin) inputFin.onchange = () => loadCajaData();
}

/**
 * Verifica estado de caja para el usuario actual
 */
async function checkCajaStatus() {
    const sb = getSupabaseClient();
    if (!sb) return;

    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;

    const { data: activeSessions, error } = await sb
        .from(CAJA_TABLE)
        .select('*')
        .eq('id_usuario', session.user.id)
        .eq('estado', 'ABIERTA')
        .order('fecha_apertura', { ascending: false })
        .limit(1);

    if (error) {
        console.error("[MOBILE-CAJA] Error verificando estado:", error);
        return;
    }

    if (activeSessions && activeSessions.length > 0) {
        currentCajaSession = activeSessions[0];
        window.sysCajaAbierta = true;
        toggleCajaLayout('open');
    } else {
        currentCajaSession = null;
        window.sysCajaAbierta = false;
        toggleCajaLayout('closed');
    }
}

function toggleCajaLayout(state) {
    const badge = document.getElementById('caja-status-badge');
    const btnAbrir = document.getElementById('btn-abrir-caja');
    const btnCerrar = document.getElementById('btn-cerrar-caja');
    const manualRow = document.getElementById('caja-manual-actions');

    if (state === 'open') {
        if (badge) {
            badge.className = "caja-badge status-open";
            badge.innerHTML = '<i class="fas fa-unlock"></i> TRABAJANDO CON CAJA';
        }
        btnAbrir?.classList.add('hidden');
        btnCerrar?.classList.remove('hidden');
        manualRow?.classList.remove('hidden');
    } else {
        if (badge) {
            badge.className = "caja-badge status-closed";
            badge.innerHTML = '<i class="fas fa-lock"></i> CAJA CERRADA';
        }
        btnAbrir?.classList.remove('hidden');
        btnCerrar?.classList.add('hidden');
        manualRow?.classList.add('hidden');
        
        // Reset visible stats
        updateStat('caja-total-ingresos', 0);
        updateStat('caja-total-egresos', 0);
        updateStat('caja-saldo-actual', 0);
    }
}

async function loadCajaData() {
    const sb = getSupabaseClient();
    if (!sb) return;

    const inputInicio = document.getElementById('filter-caja-inicio')?.value;
    const inputFin = document.getElementById('filter-caja-fin')?.value;

    const container = document.getElementById('caja-movimientos-container');
    if (container) container.innerHTML = '<div class="loading-inline"><i class="fas fa-spinner fa-spin"></i><span>Sincronizando...</span></div>';

    try {
        const { data: { session } } = await sb.auth.getSession();
        
        let query = sb.from(MOVIMIENTOS_TABLE)
            .select('*')
            .eq('id_usuario', session.user.id);

        if (inputInicio) query = query.gte('fecha_movimiento', `${inputInicio}T00:00:00`);
        if (inputFin) query = query.lte('fecha_movimiento', `${inputFin}T23:59:59`);

        const { data: movimientos, error } = await query.order('fecha_movimiento', { ascending: false });

        if (error) throw error;

        renderMovimientosCards(movimientos);

        // Stats del turno activo
        if (currentCajaSession) {
            const { data: turnMovs } = await sb.from(MOVIMIENTOS_TABLE)
                .select('*')
                .eq('id_apertura', currentCajaSession.id_apertura);
            
            processMovimientos(turnMovs || []);
        }
    } catch (error) {
        console.error("[MOBILE-CAJA] Error cargando movimientos:", error);
    }

    await loadCajaPendingManualRequestsMobile();
}

function escapeCajaHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function delayCajaNotification(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function randomCajaDelay() {
    return 5000 + Math.floor(Math.random() * 3001);
}

async function sendCajaTextNotificationMobile(whatsapp, message) {
    const cleanWhatsapp = String(whatsapp || '').trim();
    if (!cleanWhatsapp) return;

    const response = await fetch(TEXT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ whatsapp: cleanWhatsapp, message })
    });

    if (!response.ok) throw new Error(`Webhook respondió ${response.status}`);
}

async function notifyPrincipalUsersForManualMovementMobile(solicitud) {
    const sb = getSupabaseClient();
    if (!sb || !solicitud) return;

    try {
        const { data: principals, error } = await sb
            .from('ic_caja_aprobadores_principales')
            .select('id, nombre, whatsapp');

        if (error) throw error;

        const targets = (principals || []).filter(user => String(user.whatsapp || '').trim());
        if (!targets.length) return;

        const solicitante = window.currentUser?.nombre || window.currentUser?.email || 'Usuario del sistema';
        const tipo = solicitud.tipo_movimiento === 'INGRESO' ? 'ingreso' : 'egreso';
        const message = [
            `INKA CORP - Solicitud de ${tipo} manual en caja`,
            '',
            `Solicitante: ${solicitante}`,
            `Monto: ${formatCurrency(solicitud.monto)}`,
            `Motivo: ${solicitud.descripcion || 'Sin motivo registrado'}`,
            '',
            'Por favor revisa y aprueba o rechaza esta solicitud antes de que afecte la caja.',
            `Abrir caja: ${CAJA_DIRECT_URL}`
        ].join('\n');

        for (let i = 0; i < targets.length; i++) {
            if (i > 0) await delayCajaNotification(randomCajaDelay());
            try {
                await sendCajaTextNotificationMobile(targets[i].whatsapp, message);
            } catch (err) {
                console.warn('[MOBILE-CAJA] No se pudo notificar al principal:', targets[i].id, err);
            }
        }

        await sb
            .from(PENDING_MANUAL_MOVEMENTS_TABLE)
            .update({
                webhook_notificado: true,
                webhook_notificado_at: new Date().toISOString()
            })
            .eq('id_solicitud', solicitud.id_solicitud);
    } catch (error) {
        console.warn('[MOBILE-CAJA] Error notificando aprobación manual:', error);
    }
}

async function loadCajaPendingManualRequestsMobile() {
    const sb = getSupabaseClient();
    const section = document.getElementById('caja-aprobaciones-mobile');
    if (!sb || !section) return;

    try {
        const currentUser = window.currentUser || {};
        const isPrincipal = currentUser.principal === true;
        const { data: solicitudes, error } = await sb.rpc('fn_listar_solicitudes_manuales_caja');
        if (error) throw error;

        renderCajaPendingManualRequestsMobile(solicitudes || [], {}, isPrincipal);
    } catch (error) {
        console.error('[MOBILE-CAJA] Error cargando solicitudes pendientes:', error);
    }
}

function renderCajaPendingManualRequestsMobile(solicitudes, usersMap, isPrincipal) {
    const section = document.getElementById('caja-aprobaciones-mobile');
    const list = document.getElementById('caja-aprobaciones-list-mobile');
    const count = document.getElementById('caja-aprobaciones-count-mobile');
    const modal = document.getElementById('modal-caja-aprobaciones-mobile');
    const modalList = document.getElementById('caja-aprobaciones-modal-list-mobile');
    if (!section || !list || !count) return;

    if (!solicitudes.length) {
        section.classList.add('hidden');
        list.innerHTML = '';
        count.textContent = '0';
        if (modal) modal.classList.remove('active');
        if (modalList) modalList.innerHTML = '';
        releaseMobileCajaScrollIfSafe();
        return;
    }

    section.classList.remove('hidden');
    count.textContent = String(solicitudes.length);
    list.innerHTML = renderCajaPendingManualRequestsListMobile(solicitudes, usersMap, isPrincipal, false);

    const pendingForPrincipal = solicitudes.filter(item => item.estado === 'PENDIENTE');
    if (isPrincipal && pendingForPrincipal.length && modal && modalList) {
        modalList.innerHTML = renderCajaPendingManualRequestsListMobile(pendingForPrincipal, usersMap, isPrincipal, true);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else if (modal) {
        modal.classList.remove('active');
        releaseMobileCajaScrollIfSafe();
    }
}

function releaseMobileCajaScrollIfSafe() {
    setTimeout(() => {
        const hasActiveLiteModal = !!document.querySelector('.modal-overlay.active');
        const hasActiveSwal = !!document.querySelector('.swal2-container.swal2-shown');
        if (!hasActiveLiteModal && !hasActiveSwal) {
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.width = '';
        }
    }, 60);
}

function renderCajaPendingManualRequestsListMobile(solicitudes, usersMap, isPrincipal, forceApprovalActions = false) {
    return solicitudes.map(item => {
        const user = usersMap[item.id_solicitante] || {};
        const userName = escapeCajaHtml(item.solicitante_nombre || user.nombre || user.email || 'Usuario no identificado');
        const isIngreso = item.tipo_movimiento === 'INGRESO';
        const fecha = item.fecha_solicitud ? new Date(item.fecha_solicitud) : null;
        const canApprove = isPrincipal && item.estado === 'PENDIENTE' && forceApprovalActions;
        const canUploadProof = item.estado === 'APROBADO' && !item.id_movimiento && (item.id_solicitante === window.currentUser?.id || isPrincipal);
        const statusLabel = item.estado === 'APROBADO' ? 'Aprobado, falta comprobante' : 'Pendiente de aprobación';

        return `
            <div class="mobile-approval-card ${isIngreso ? 'income' : 'expense'}">
                <div class="approval-mobile-top">
                    <span class="approval-mobile-type"><i class="fas ${isIngreso ? 'fa-arrow-down' : 'fa-arrow-up'}"></i> ${escapeCajaHtml(item.tipo_movimiento)}</span>
                    <strong>${formatCurrency(item.monto)}</strong>
                </div>
                <p>${escapeCajaHtml(item.descripcion || 'Sin motivo registrado')}</p>
                <div class="approval-mobile-meta">
                    <span class="${item.estado === 'APROBADO' ? 'approved' : 'pending'}">${statusLabel}</span>
                    <span>${userName}</span>
                    <span>${fecha ? fecha.toLocaleString() : 'Sin fecha'}</span>
                </div>
                <div class="approval-mobile-actions">
                    ${canApprove ? `
                        <button class="lite-btn success" onclick="approveManualMovementRequestMobile('${item.id_solicitud}')"><i class="fas fa-check"></i> Aprobar</button>
                        <button class="lite-btn danger" onclick="rejectManualMovementRequestMobile('${item.id_solicitud}')"><i class="fas fa-times"></i> Rechazar</button>
                    ` : canUploadProof ? `
                        <button class="lite-btn primary" onclick="uploadApprovedManualMovementProofMobile('${item.id_solicitud}')"><i class="fas fa-upload"></i> Subir comprobante</button>
                    ` : `
                        <span class="approval-mobile-waiting"><i class="fas fa-hourglass-half"></i> En revisión</span>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function processMovimientos(movimientos) {
    ingresosTurno = 0;
    egresosTurno = 0;

    movimientos.forEach(m => {
        const monto = parseFloat(m.monto || 0);
        if (m.tipo_movimiento === 'INGRESO') ingresosTurno += monto;
        else egresosTurno += monto;
    });

    currentBalance = (parseFloat(currentCajaSession.saldo_inicial) + ingresosTurno) - egresosTurno;

    updateStat('caja-total-ingresos', ingresosTurno);
    updateStat('caja-total-egresos', egresosTurno);
    updateStat('caja-saldo-actual', currentBalance);
}

function updateStat(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = formatCurrency(val);
}

function renderMovimientosCards(movimientos) {
    const container = document.getElementById('caja-movimientos-container');
    if (!container) return;

    if (!movimientos || movimientos.length === 0) {
        container.innerHTML = `
            <div class="empty-state-mobile">
                <i class="fas fa-receipt"></i>
                <p>No hay movimientos registrados</p>
                <span>Ajusta los filtros o inicia un nuevo turno para ver datos aquí.</span>
            </div>`;
        return;
    }

    container.innerHTML = movimientos.map(m => {
        const isIngreso = m.tipo_movimiento === 'INGRESO';
        const date = new Date(m.fecha_movimiento);
        
        return `
            <div class="caja-move-card">
                <div class="move-icon ${isIngreso ? 'income' : 'expense'}">
                    <i class="fas ${isIngreso ? 'fa-plus' : 'fa-minus'}"></i>
                </div>
                <div class="move-details">
                    <div class="move-header">
                        <span class="move-cat">${(m.categoria || 'MANUAL').replace('_', ' ')}</span>
                        <span class="move-amount ${isIngreso ? 'text-success' : 'text-danger'}">
                            ${isIngreso ? '+' : '-'} ${formatCurrency(m.monto)}
                        </span>
                    </div>
                    <div class="move-desc">${m.descripcion || 'Sin descripción'}</div>
                    <div class="move-footer">
                        <span><i class="fas fa-clock"></i> ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span><i class="fas fa-calendar-day"></i> ${date.toLocaleDateString()}</span>
                        ${m.comprobante_url ? `<button onclick="window.open('${m.comprobante_url}', '_blank')" class="btn-eye-mobile"><i class="fas fa-eye"></i></button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Acciones Móviles 
 */

function showAperturaModal() {
    openLiteModal('modal-apertura-caja');
}

async function handleAperturaCaja(e) {
    e.preventDefault();
    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const saldoInicial = parseFloat(formData.get('saldo_inicial'));
    const observaciones = formData.get('observaciones');
    
    const { data: { session } } = await sb.auth.getSession();

    try {
        const { data, error } = await sb
            .from(CAJA_TABLE)
            .insert([{
                id_usuario: session.user.id,
                saldo_inicial: saldoInicial,
                observaciones: observaciones,
                fecha_apertura: new Date().toISOString(),
                estado: 'ABIERTA'
            }])
            .select();

        if (error) throw error;

        currentCajaSession = data[0];
        window.sysCajaAbierta = true;
        closeLiteModal('modal-apertura-caja');
        e.target.reset();
        toggleCajaLayout('open');
        await loadCajaData();
        
        // Activación dinámica: Sincronizar estado global
        if (typeof window.checkCajaStatusGlobal === 'function') {
            await window.checkCajaStatusGlobal();
        }

        if (window.Swal) Swal.fire("¡Éxito!", "Caja abierta correctamente", "success");
    } catch (e) {
        if (window.Swal) Swal.fire("Error", e.message, "error");
    }
}

function showMovimientoManualModal(tipo) {
    const title = document.getElementById('manual-modal-title');
    const typeField = document.getElementById('manual-tipo');
    
    if (typeField) typeField.value = tipo;
    if (title) title.innerHTML = tipo === 'INGRESO' 
        ? '<i class="fas fa-plus-circle text-success"></i> Nuevo Ingreso' 
        : '<i class="fas fa-minus-circle text-danger"></i> Nuevo Egreso';

    openLiteModal('modal-movimiento-manual');
}

async function handleMovimientoManual(e) {
    e.preventDefault();
    if (!currentCajaSession) return;

    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const monto = parseFloat(formData.get('monto'));
    const tipo = formData.get('tipo_movimiento');
    const desc = formData.get('descripcion');
    const metodo = formData.get('metodo_pago');

    const { data: { session } } = await sb.auth.getSession();

    try {
        const { data: solicitud, error } = await sb
            .from(PENDING_MANUAL_MOVEMENTS_TABLE)
            .insert([{
                id_solicitante: session.user.id,
                tipo_movimiento: tipo,
                monto: monto,
                descripcion: desc,
                metodo_pago: metodo,
                categoria: tipo === 'INGRESO' ? 'INCREMENTO_EXTERNO' : 'RETIRO_EXTERNO'
            }])
            .select()
            .single();

        if (error) throw error;

        closeLiteModal('modal-movimiento-manual');
        e.target.reset();
        await loadCajaPendingManualRequestsMobile();
        await notifyPrincipalUsersForManualMovementMobile(solicitud);
        if (window.Swal) Swal.fire("Solicitud enviada", `${tipo} pendiente de aprobación principal`, "success");
    } catch (e) {
        if (window.Swal) Swal.fire("Error", e.message, "error");
    }
}

async function resolveManualMovementRequestMobile(idSolicitud, approve, observacion = null) {
    const sb = getSupabaseClient();
    if (!sb || !idSolicitud) return;

    try {
        if (window.Swal) {
            Swal.fire({
                title: approve ? 'Aprobando...' : 'Rechazando...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
            });
        }

        const { error } = await sb.rpc('fn_resolver_movimiento_manual_caja', {
            p_id_solicitud: idSolicitud,
            p_aprobar: approve,
            p_observacion: observacion
        });

        if (error) throw error;

        await loadCajaPendingManualRequestsMobile();
        await loadCajaData();

        if (window.Swal) {
            await Swal.fire(
                approve ? 'Movimiento aprobado' : 'Solicitud rechazada',
                approve ? 'El solicitante ya puede subir el comprobante final.' : 'La solicitud quedó rechazada.',
                'success'
            );
            releaseMobileCajaScrollIfSafe();
        }
    } catch (error) {
        console.error('[MOBILE-CAJA] Error resolviendo solicitud:', error);
        if (window.Swal) Swal.fire('No se pudo procesar', error.message || 'Intenta nuevamente.', 'error');
    }
}

async function approveManualMovementRequestMobile(idSolicitud) {
    const result = await Swal.fire({
        icon: 'question',
        title: 'Aprobar movimiento',
        text: 'La caja se moverá recién cuando el solicitante suba el comprobante.',
        showCancelButton: true,
        confirmButtonText: 'Sí, aprobar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        await resolveManualMovementRequestMobile(idSolicitud, true, null);
    }
}

async function rejectManualMovementRequestMobile(idSolicitud) {
    const result = await Swal.fire({
        icon: 'warning',
        title: 'Rechazar solicitud',
        input: 'textarea',
        inputLabel: 'Motivo u observación',
        inputPlaceholder: 'Indica brevemente por qué se rechaza...',
        inputAttributes: { maxlength: 300 },
        showCancelButton: true,
        confirmButtonText: 'Rechazar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ef4444',
        cancelButtonColor: '#334155'
    });

    if (result.isConfirmed) {
        await resolveManualMovementRequestMobile(idSolicitud, false, result.value || null);
    }
}

async function uploadApprovedManualMovementProofMobile(idSolicitud) {
    currentCajaProofSolicitudId = idSolicitud;
    currentCajaProofFile = null;

    const preview = document.getElementById('caja-proof-preview-mobile');
    const note = document.getElementById('caja-proof-compression-note-mobile');
    const camera = document.getElementById('caja-proof-camera-mobile');
    const gallery = document.getElementById('caja-proof-gallery-mobile');

    if (camera) camera.value = '';
    if (gallery) gallery.value = '';
    if (preview) {
        preview.innerHTML = '';
        preview.classList.add('hidden');
    }
    if (note) {
        note.innerHTML = '';
        note.classList.add('hidden');
    }
    openLiteModal('modal-caja-proof-upload-mobile');
}

function closeCajaProofUploadModalMobile() {
    closeLiteModal('modal-caja-proof-upload-mobile');
    currentCajaProofSolicitudId = null;
    currentCajaProofFile = null;
    releaseMobileCajaScrollIfSafe();
}

function handleCajaProofFileSelectedMobile(event) {
    const file = event.target.files?.[0];
    if (file) setCajaProofFileMobile(file);
}

function formatCajaFileSizeMobile(bytes = 0) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function setCajaProofFileMobile(file) {
    currentCajaProofFile = file;
    const preview = document.getElementById('caja-proof-preview-mobile');
    const note = document.getElementById('caja-proof-compression-note-mobile');
    if (!preview) return;

    const ext = (file.name || '').split('.').pop()?.toLowerCase();
    const isPdf = file.type === 'application/pdf' || ext === 'pdf';
    const isHeic = ['heic', 'heif'].includes(ext) || ['image/heic', 'image/heif'].includes(file.type);

    preview.classList.remove('hidden');
    preview.innerHTML = `
        <div class="proof-preview-icon-mobile ${isPdf ? 'pdf' : ''}">
            <i class="fas ${isPdf ? 'fa-file-pdf' : 'fa-image'}"></i>
        </div>
        <div>
            <strong>${escapeCajaHtml(file.name || 'comprobante')}</strong>
            <span>${formatCajaFileSizeMobile(file.size)}</span>
        </div>
    `;

    if (note) {
        note.classList.remove('hidden');
        note.innerHTML = isPdf
            ? '<i class="fas fa-info-circle"></i> Los PDF se suben sin compresión. Para menor peso, toma una foto del comprobante.'
            : `<i class="fas fa-compress-alt"></i> ${isHeic ? 'Archivo HEIC detectado: se intentará convertir y comprimir.' : 'La imagen se comprimirá antes de subir.'}`;
    }
}

async function submitCajaProofUploadMobile() {
    const sb = getSupabaseClient();
    if (!sb || !currentCajaProofSolicitudId) return;

    if (!currentCajaProofFile) {
        Swal.fire('Selecciona un comprobante', 'Toma una foto o carga una imagen desde galería.', 'warning');
        return;
    }

    try {
        Swal.fire({
            title: 'Registrando...',
            text: 'Optimizando comprobante y actualizando caja.',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const uploadRes = await window.uploadFileToStorage(
            currentCajaProofFile,
            'caja/manuales',
            window.currentUser?.id || 'mobile',
            'inkacorp',
            CAJA_PROOF_COMPRESSION
        );
        if (!uploadRes.success) {
            throw new Error(uploadRes.error || 'No se pudo subir el comprobante.');
        }

        const { error } = await sb.rpc('fn_registrar_movimiento_manual_aprobado', {
            p_id_solicitud: currentCajaProofSolicitudId,
            p_comprobante_url: uploadRes.url
        });

        if (error) throw error;

        closeCajaProofUploadModalMobile();
        await loadCajaPendingManualRequestsMobile();
        await loadCajaData();

        await Swal.fire('Movimiento registrado', 'La caja ya refleja el movimiento con su comprobante.', 'success');
        releaseMobileCajaScrollIfSafe();
    } catch (error) {
        console.error('[MOBILE-CAJA] Error registrando comprobante:', error);
        Swal.fire('No se pudo registrar', error.message || 'Intenta nuevamente.', 'error');
    }
}

function showCierreModal() {
    const label = document.getElementById('cierre-saldo-previsto');
    if (label) label.textContent = formatCurrency(currentBalance);
    openLiteModal('modal-cierre-caja');
}

async function handleCierreCaja(e) {
    e.preventDefault();
    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const saldoReal = parseFloat(formData.get('saldo_final'));
    const observaciones = formData.get('observaciones');

    try {
        const { error } = await sb
            .from(CAJA_TABLE)
            .update({
                saldo_final: saldoReal,
                observaciones: (currentCajaSession.observaciones || '') + ' | CIERRE MOVIL: ' + observaciones,
                fecha_cierre: new Date().toISOString(),
                estado: 'CERRADA'
            })
            .eq('id_apertura', currentCajaSession.id_apertura);

        if (error) throw error;

        closeLiteModal('modal-cierre-caja');
        currentCajaSession = null;
        window.sysCajaAbierta = false;
        toggleCajaLayout('closed');

        // Activación dinámica: Sincronizar estado global
        if (typeof window.checkCajaStatusGlobal === 'function') {
            await window.checkCajaStatusGlobal();
        }

        if (window.Swal) Swal.fire("Caja Cerrada", "Sesion de trabajo finalizada", "info");
    } catch (e) {
        if (window.Swal) Swal.fire("Error", e.message, "error");
    }
}

/**
 * LÓGICA DE TRANSFERENCIAS MÓVIL
 */

/**
 * Muestra modal para iniciar transferencia
 */
async function showTransferModalMobile() {
    if (!currentCajaSession) {
        if (window.Swal) Swal.fire("Caja Cerrada", "Debes tener tu caja abierta para transferir.", "warning");
        return;
    }

    // ABRIR EL MODAL DE INMEDIATO para dar respuesta al toque
    openLiteModal('modal-transferencia-mobile');

    const balanceEl = document.getElementById('transfer-current-balance-mobile');
    if (balanceEl) balanceEl.textContent = formatCurrency(currentBalance || 0);
    
    // Cargar destinatarios de forma asíncrona pero sin bloquear la apertura
    loadTransferDestinationsMobile();

    // Validación de saldo en tiempo real
    const inputMonto = document.getElementById('transfer-monto-mobile');
    const msgError = document.getElementById('transfer-error-mobile');
    const btnConfirm = document.getElementById('btn-confirm-transfer-mobile');

    if (inputMonto) {
        inputMonto.oninput = () => {
            const val = parseFloat(inputMonto.value || 0);
            if (val > currentBalance) {
                msgError?.classList.remove('hidden');
                btnConfirm?.setAttribute('disabled', 'true');
            } else {
                msgError?.classList.add('hidden');
                btnConfirm?.removeAttribute('disabled');
            }
        };
    }
}

async function loadTransferDestinationsMobile() {
    const sb = getSupabaseClient();
    const select = document.getElementById('transfer-destino-mobile');
    if (!select) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        const { data: users, error } = await sb.from('ic_users').select('id, nombre').eq('activo', true).neq('id', session.user.id);

        if (error) throw error;

        select.innerHTML = '<option value="">Seleccione compañero...</option>' + 
            users.map(u => `<option value="${u.id}">${u.nombre}</option>`).join('');
    } catch (err) {
        console.error("Error cargando usuarios:", err);
    }
}

function updateMobileFileName(input, targetId) {
    const el = document.getElementById(targetId);
    if (el && input.files.length > 0) {
        el.textContent = input.files[0].name;
        el.style.color = "var(--success)";
    }
}

async function handleEnviarTransferenciaMobile(e) {
    e.preventDefault();
    if (!currentCajaSession) return;

    const sb = getSupabaseClient();
    const btn = document.getElementById('btn-confirm-transfer-mobile');
    const originalText = btn.innerHTML;

    try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ENVIANDO...';
        btn.disabled = true;

        const idDestino = document.getElementById('transfer-destino-mobile').value;
        const monto = parseFloat(document.getElementById('transfer-monto-mobile').value);
        const descripcion = document.getElementById('transfer-descripcion-mobile').value;
        const cameraInput = document.getElementById('transfer-file-camera-mobile');
        const galleryInput = document.getElementById('transfer-file-gallery-mobile');
        const file = (cameraInput?.files.length > 0) ? cameraInput.files[0] : (galleryInput?.files.length > 0 ? galleryInput.files[0] : null);

        if (monto > currentBalance) throw new Error("Saldo insuficiente para esta transferencia.");

        let comprobanteUrl = null;
        if (file) {
            const fileName = `TRANSFER_${Date.now()}`;
            // Correct format: uploadFileToStorage(file, folder, id, bucket)
            const uploadRes = await window.uploadFileToStorage(file, 'caja/transferencias', fileName, 'inkacorp');
            if (uploadRes.success) {
                comprobanteUrl = uploadRes.url;
            } else {
                throw new Error("No se pudo subir la evidencia: " + uploadRes.error);
            }
        }

        const { error } = await sb.from(TRANSFERENCIAS_TABLE).insert([{
            id_usuario_origen: currentCajaSession.id_usuario,
            id_usuario_destino: idDestino,
            monto: monto,
            descripcion: descripcion,
            comprobante_url: comprobanteUrl,
            estado: 'PENDIENTE'
        }]);

        if (error) throw error;

        closeLiteModal('modal-transferencia-mobile');
        if (window.Swal) Swal.fire("¡Enviado!", "Transferencia registrada correctamente", "success");
        
        await loadCajaData(); // Refrescar balance

    } catch (err) {
        console.error("Error en transferencia:", err);
        if (window.Swal) Swal.fire("Error", err.message, "error");
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

/**
 * POLLING PARA RECEPTOR
 */
async function checkPendingTransfersMobile() {
    const sb = getSupabaseClient();
    if (!sb) return;

    try {
        const { data: { session } } = await sb.auth.getSession();
        if (!session) return;

        const { data, error } = await sb
            .from(TRANSFERENCIAS_TABLE)
            .select(`*, id_usuario_origen(nombre)`)
            .eq('id_usuario_destino', session.user.id)
            .eq('estado', 'PENDIENTE')
            .order('fecha_envio', { ascending: true }) // Cambiar fecha_transferencia por fecha_envio
            .limit(1);

        if (error) throw error;

        const alertBanner = document.getElementById('transfer-alert-mobile');
        if (data && data.length > 0) {
            currentPendingTransfer = data[0];
            if (alertBanner) {
                alertBanner.innerHTML = `<i class="fas fa-hand-holding-usd"></i> Transferencia de: ${currentPendingTransfer.id_usuario_origen?.nombre || 'Alguien'}`;
                alertBanner.classList.remove('hidden');
            }
        } else {
            currentPendingTransfer = null;
            if (alertBanner) alertBanner.classList.add('hidden');
        }
    } catch (err) {
        console.error("Error polling transferencias:", err);
    }
}

function showAceptarTransferModal() {
    if (!currentPendingTransfer) return;

    // Llenar datos
    document.getElementById('recibir-origen-mobile').textContent = currentPendingTransfer.id_usuario_origen?.nombre || 'Desconocido';
    document.getElementById('recibir-monto-mobile').textContent = formatCurrency(currentPendingTransfer.monto);
    document.getElementById('recibir-descripcion-mobile').textContent = currentPendingTransfer.descripcion || 'Sin nota adjunta';

    const imgBox = document.getElementById('recibir-comprobante-box-mobile');
    const imgPreview = document.getElementById('recibir-img-mobile');

    if (currentPendingTransfer.comprobante_url) {
        imgPreview.src = currentPendingTransfer.comprobante_url;
        imgBox.classList.remove('hidden');
    } else {
        imgBox.classList.add('hidden');
    }

    openLiteModal('modal-aceptar-transferencia-mobile');
}

async function handleProcesarTransferenciaMobile(nuevoEstado) {
    if (!currentPendingTransfer) return;

    // SI ACEPTA, VALIDAR CAJA ABIERTA
    if (nuevoEstado === 'ACEPTADA' && !currentCajaSession) {
        if (window.Swal) Swal.fire("Caja Cerrada", "Abre tu caja primero para recibir fondos.", "warning");
        return;
    }

    const sb = getSupabaseClient();
    
    try {
        const { error } = await sb
            .from(TRANSFERENCIAS_TABLE)
            .update({ estado: nuevoEstado })
            .eq('id_transferencia', currentPendingTransfer.id_transferencia);

        if (error) throw error;

        closeLiteModal('modal-aceptar-transferencia-mobile');
        if (window.Swal) Swal.fire("Completado", `Transferencia ${nuevoEstado.toLowerCase()}`, "success");

        currentPendingTransfer = null;
        checkPendingTransfersMobile(); // Quitar banner
        loadCajaData(); // Refrescar movimientos

    } catch (err) {
        console.error("Error procesando transferencia:", err);
        if (window.Swal) Swal.fire("Error", err.message, "error");
    }
}

function previewMobileImage(event, targetId) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const previewBox = document.getElementById(targetId);
            const previewImg = document.getElementById('preview-img');
            if (previewImg) previewImg.src = e.target.result;
            if (previewBox) {
                previewBox.classList.remove('hidden');
                
                // Asegurar que el botn de registro sea visible tras cargar la imagen
                setTimeout(() => {
                    const btnSave = document.getElementById('btn-save-manual');
                    if (btnSave) {
                        btnSave.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }, 100);
            }
        }
        reader.readAsDataURL(file);
    }
}

// Helpers
function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

// Global Exports
window.initCajaModule = initCajaModule;
window.showAperturaModal = showAperturaModal;
window.handleAperturaCaja = handleAperturaCaja;
window.showMovimientoManualModal = showMovimientoManualModal;
window.handleMovimientoManual = handleMovimientoManual;
window.approveManualMovementRequestMobile = approveManualMovementRequestMobile;
window.rejectManualMovementRequestMobile = rejectManualMovementRequestMobile;
window.uploadApprovedManualMovementProofMobile = uploadApprovedManualMovementProofMobile;
window.closeCajaProofUploadModalMobile = closeCajaProofUploadModalMobile;
window.handleCajaProofFileSelectedMobile = handleCajaProofFileSelectedMobile;
window.submitCajaProofUploadMobile = submitCajaProofUploadMobile;
window.showCierreModal = showCierreModal;
window.handleCierreCaja = handleCierreCaja;
window.previewMobileImage = previewMobileImage;
window.loadCajaData = loadCajaData;

// Exportaciones Transferencia
window.showTransferModalMobile = showTransferModalMobile;
window.updateMobileFileName = updateMobileFileName;
window.handleEnviarTransferenciaMobile = handleEnviarTransferenciaMobile;
window.showAceptarTransferModal = showAceptarTransferModal;
window.handleProcesarTransferenciaMobile = handleProcesarTransferenciaMobile;
