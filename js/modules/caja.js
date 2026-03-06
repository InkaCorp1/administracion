/**
 * INKA CORP - Módulo Caja
 * Gestión de aperturas, cierres y movimientos de caja.
 * Implementación basada en el esquema de base de datos ic_caja_aperturas e ic_caja_movimientos.
 */

const CAJA_TABLE = 'ic_caja_aperturas';
const MOVIMIENTOS_TABLE = 'ic_caja_movimientos';

let currentSessionUser = null; // ID del usuario cuya caja estamos viendo
let loggedInUser = null; // Datos del usuario autenticado
let currentCajaSession = null;
let currentBalance = 0;
let ingresosTurno = 0;
let egresosTurno = 0;
let currentPendingTransfer = null; // Para gestionar entrada recibida

/**
 * Inicialización del módulo
 */
async function initCajaModule() {
    try {
        const sb = getSupabaseClient();
        const session = await sb.auth.getSession();
        if (!session.data.session) return;
        
        // Cargar datos del perfil (necesitamos el ROL)
        const { data: profile } = await sb.from('ic_users').select('*').eq('id', session.data.session.user.id).single();
        loggedInUser = profile || session.data.session.user;
        currentSessionUser = loggedInUser.id; // Por defecto el usuario actual
        
        setTodayDate();
        setupDateFilters();
        
        // Si es admin, mostrar selector de usuarios
        if (loggedInUser.rol === 'admin') {
            await renderUserSelector();
        }

        await checkCajaStatus();
        await loadCajaData();
        
        // Verificar si hay transferencias entrantes
        await checkIncomingTransfer();
    } catch (error) {
        console.error("[CAJA] Error inicializando módulo:", error);
    }
}

async function renderUserSelector() {
    const selector = document.getElementById('caja-user-selector');
    if (!selector) return;

    const sb = getSupabaseClient();
    const { data: users, error } = await sb.from('ic_users').select('id, nombre, rol').eq('activo', true);
    
    if (error || !users) return;

    // Ordenar: El usuario actual primero, luego el resto por nombre
    users.sort((a, b) => {
        if (a.id === loggedInUser.id) return -1;
        if (b.id === loggedInUser.id) return 1;
        return a.nombre.localeCompare(b.nombre);
    });

    selector.classList.remove('hidden');
    selector.innerHTML = `
        <div class="user-selector-header">
            <span><i class="fas fa-users-cog"></i> Ver caja de:</span>
        </div>
        <div class="user-chips-container">
            ${users.map(u => `
                <div class="user-chip ${u.id === currentSessionUser ? 'active' : ''}" onclick="switchUserCaja('${u.id}')">
                    <div class="user-avatar">${u.nombre.charAt(0).toUpperCase()}</div>
                    <div class="user-info">
                        <span class="u-name">${u.id === loggedInUser.id ? 'Mi Caja (' + u.nombre + ')' : u.nombre}</span>
                        <span class="u-role">${u.rol}</span>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function switchUserCaja(userId) {
    if (userId === currentSessionUser) return;
    
    currentSessionUser = userId;
    
    // Actualizar UI de chips
    const chips = document.querySelectorAll('.user-chip');
    chips.forEach(c => {
        c.classList.toggle('active', c.getAttribute('onclick').includes(userId));
    });

    // Recargar todo el módulo para este usuario
    await checkCajaStatus();
    await loadCajaData();
}

function setupDateFilters() {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1); // 1 mes atrás

    const inputInicio = document.getElementById('filter-caja-inicio');
    const inputFin = document.getElementById('filter-caja-fin');

    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    if (inputInicio && !inputInicio.value) {
        inputInicio.value = formatDate(oneMonthAgo);
    }
    if (inputFin && !inputFin.value) {
        inputFin.value = formatDate(today);
    }
}

function setTodayDate() {
    const today = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateLabel = document.getElementById('caja-current-date');
    if (dateLabel) dateLabel.textContent = today.toLocaleDateString('es-ES', options).toUpperCase();
}

/**
 * Verifica si existe una caja abierta para el usuario actual
 */
async function checkCajaStatus() {
    const sb = getSupabaseClient();
    if (!sb) return;

    if (!currentSessionUser) {
        const { data: { session } } = await sb.auth.getSession();
        if (session) currentSessionUser = session.user.id;
    }

    const { data: activeSessions, error } = await sb
        .from(CAJA_TABLE)
        .select('*')
        .eq('id_usuario', currentSessionUser)
        .eq('estado', 'ABIERTA')
        .order('fecha_apertura', { ascending: false })
        .limit(1);

    if (error) {
        console.error("[CAJA] Error verificando estado:", error);
        return;
    }

    if (activeSessions && activeSessions.length > 0) {
        currentCajaSession = activeSessions[0];
        // Sincronizar estado global solo si es la caja del usuario logueado
        if (currentSessionUser === loggedInUser?.id) {
            window.sysCajaAbierta = true;
        }
        toggleCajaLayout('open');
    } else {
        currentCajaSession = null;
        if (currentSessionUser === loggedInUser?.id) {
            window.sysCajaAbierta = false;
        }
        toggleCajaLayout('closed');
    }
}

function toggleCajaLayout(state) {
    const badge = document.getElementById('caja-status-badge');
    const btnAbrir = document.getElementById('btn-abrir-caja');
    const btnCerrar = document.getElementById('btn-cerrar-caja');
    const btnIngreso = document.getElementById('btn-ingreso-manual');
    const btnEgreso = document.getElementById('btn-egreso-manual');
    const btnTransfer = document.getElementById('btn-transferencia-caja');
    const statsContainer = document.querySelector('.caja-stats-grid');
    
    // Si no estamos viendo nuestra propia caja, ocultar botones de acción pero mostrar stats
    const isOurCaja = currentSessionUser === loggedInUser?.id;

    if (state === 'open') {
        if (badge) {
            badge.className = "badge-status-v2 status-open";
            badge.innerHTML = `<i class="fas fa-unlock"></i> CAJA ABIERTA${!isOurCaja ? ' (OTRO USUARIO)' : ''}`;
        }
        btnAbrir?.classList.add('hidden');
        btnCerrar?.classList.toggle('hidden', !isOurCaja);
        btnIngreso?.classList.toggle('hidden', !isOurCaja);
        btnEgreso?.classList.toggle('hidden', !isOurCaja);
        btnTransfer?.classList.toggle('hidden', !isOurCaja);
    } else {
        if (badge) {
            badge.className = "badge-status-v2 status-closed";
            badge.innerHTML = `<i class="fas fa-lock"></i> CAJA CERRADA${!isOurCaja ? ' (OTRO USUARIO)' : ''}`;
        }
        btnAbrir?.classList.toggle('hidden', !isOurCaja);
        btnCerrar?.classList.add('hidden');
        btnIngreso?.classList.add('hidden');
        btnEgreso?.classList.add('hidden');
        btnTransfer?.classList.add('hidden');

        // Reset stats si estamos viendo una caja cerrada
        updateStat('caja-total-ingresos', 0);
        updateStat('caja-total-egresos', 0);
        updateStat('caja-saldo-actual', 0);
        updateStat('caja-saldo-inicial', 0);
    }

    // Disparar actualización de UI global solo si es nuestra caja
    if (isOurCaja && typeof window.updateDashboardCajaStatus === 'function') {
        window.updateDashboardCajaStatus();
    }
}

async function loadCajaData() {
    const sb = getSupabaseClient();
    if (!sb) return;

    const inputInicio = document.getElementById('filter-caja-inicio')?.value;
    const inputFin = document.getElementById('filter-caja-fin')?.value;

    updateMovimientosTitle(inputInicio, inputFin);

    try {
        let query = sb.from(MOVIMIENTOS_TABLE)
            .select('*')
            .eq('id_usuario', currentSessionUser);

        if (inputInicio) query = query.gte('fecha_movimiento', `${inputInicio}T00:00:00`);
        if (inputFin) query = query.lte('fecha_movimiento', `${inputFin}T23:59:59`);

        const { data: movimientos, error } = await query.order('fecha_movimiento', { ascending: false });

        if (error) throw error;

        // Render table with filtered movements
        renderMovimientosTable(movimientos);

        // Stats specific for the current active turn (even if movements are outside filtered range)
        if (currentCajaSession) {
            // Re-fetch only turn movements for accuracy if they might be filtered out
            const { data: turnMovs } = await sb.from(MOVIMIENTOS_TABLE)
                .select('*')
                .eq('id_apertura', currentCajaSession.id_apertura);
            
            processMovimientos(turnMovs || []);
        } else {
            // Reset visible stats if no session
            updateStat('caja-total-ingresos', 0);
            updateStat('caja-total-egresos', 0);
            updateStat('caja-saldo-actual', 0);
            updateStat('caja-saldo-inicial', 0);
        }
    } catch (error) {
        console.error("[CAJA] Error cargando movimientos:", error);
    }
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

    updateStat('caja-saldo-inicial', currentCajaSession.saldo_inicial);
    updateStat('caja-total-ingresos', ingresosTurno);
    updateStat('caja-total-egresos', egresosTurno);
    updateStat('caja-saldo-actual', currentBalance);
}

function updateStat(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = formatCurrency(val);
}

/** 
 * TRANSFERENCIA INTER-CAJAS (ENVIAR)
 */
async function showTransferModal() {
    const sb = getSupabaseClient();

    // 1. Verificación Crítica: El usuario que envía el dinero debe tener su propia caja ABIERTA.
    // Buscamos la sesión abierta del usuario logueado específicamente
    const { data: ownSession } = await sb
        .from('ic_caja_aperturas')
        .select('id_apertura, estado')
        .eq('id_usuario', loggedInUser.id)
        .eq('estado', 'ABIERTA')
        .maybeSingle();

    if (!ownSession) {
        Swal.fire({ 
            icon: 'warning', 
            title: 'Caja Cerrada', 
            text: 'Debes tener TU propia caja ABIERTA para poder enviar dinero a un compañero.' 
        });
        return;
    }

    // Actualizar balance en el modal (de TU caja, no la que estás viendo si eres admin)
    // No usamos currentBalance porque podría ser la de otro usuario
    const { data: movs } = await sb.from('ic_caja_movimientos').select('tipo_movimiento, monto').eq('id_apertura', ownSession.id_apertura);
    const saldos = (movs || []).reduce((acc, m) => {
        if (m.tipo_movimiento === 'INGRESO') return acc + parseFloat(m.monto);
        return acc - parseFloat(m.monto);
    }, 0);
    
    // Necesitamos el saldo inicial
    const { data: sInit } = await sb.from('ic_caja_aperturas').select('saldo_inicial').eq('id_apertura', ownSession.id_apertura).single();
    const myCurrentBalance = (sInit?.saldo_inicial || 0) + saldos;

    const balanceEl = document.getElementById('transfer-current-balance');
    if (balanceEl) balanceEl.textContent = formatCurrency(myCurrentBalance);

    // Guardar para validación de envío
    window._myTransferBalance = myCurrentBalance;

    const { data: users } = await sb.from('ic_users').select('id, nombre, rol').eq('activo', true);
    
    const select = document.getElementById('transfer-destino');
    if (select && users) {
        select.innerHTML = '<option value="">Seleccione un compañero...</option>' + 
            users.filter(u => u.id !== loggedInUser.id)
                 .map(u => `<option value="${u.id}">${u.nombre} (${u.rol})</option>`).join('');
    }

    // Listener para validación en tiempo real del monto
    const montoInput = document.getElementById('transfer-monto');
    const errorMsg = document.getElementById('transfer-limit-msg');
    const btnConfirm = document.getElementById('btn-confirm-transfer');

    if (montoInput) {
        montoInput.addEventListener('input', () => {
            const monto = parseFloat(montoInput.value || 0);
            const isExceeded = monto > currentBalance;
            
            errorMsg?.classList.toggle('hidden', !isExceeded);
            montoInput.style.borderColor = isExceeded ? 'var(--danger)' : '';
            
            if (btnConfirm) {
                btnConfirm.disabled = isExceeded;
                btnConfirm.style.opacity = isExceeded ? '0.5' : '1';
                btnConfirm.style.cursor = isExceeded ? 'not-allowed' : 'pointer';
            }
        });
    }

    showModal('modal-transferencia-caja');
}

async function handleEnviarTransferencia(event) {
    event.preventDefault();
    const sb = getSupabaseClient();

    // 1. REVALIDACIÓN Crítica: No enviamos dinero si no tenemos una caja ABIERTA
    // No usamos 'currentCajaSession' porque un admin podría estar viendo la de otro
    const { data: ownSession } = await sb
        .from('ic_caja_aperturas')
        .select('id_apertura, estado')
        .eq('id_usuario', loggedInUser.id)
        .eq('estado', 'ABIERTA')
        .maybeSingle();

    if (!ownSession) {
        Swal.fire({ icon: 'error', title: 'Caja Cerrada', text: 'Debes abrir tu caja para poder enviar fondos.' });
        return;
    }

    const id_destino = document.getElementById('transfer-destino').value;
    const monto = parseFloat(document.getElementById('transfer-monto').value);

    // Revalidar balance desde variable guardada en showTransferModal o calculando de nuevo
    if (monto > (window._myTransferBalance || 0)) {
        Swal.fire({ icon: 'error', title: 'Fondos insuficientes', text: 'El monto excede tu saldo disponible.' });
        return;
    }

    const descripcion = document.getElementById('transfer-descripcion').value;
    const fileInput = document.getElementById('transfer-comprobante');

    if (!id_destino || isNaN(monto) || monto <= 0) {
        Swal.fire({ icon: 'error', title: 'Datos inválidos', text: 'Por favor complete todos los campos requeridos.' });
        return;
    }

    if (monto > currentBalance) {
        Swal.fire({
            title: 'Saldo insuficiente',
            text: `No tienes fondos suficientes. Tu saldo actual es ${formatCurrency(currentBalance)}.`,
            icon: 'error'
        });
        return;
    }

    try {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        let url_comprobante = null;
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            
            // Usar utilidad global para compresión y subida con subcarpetas
            // Carpeta: caja/transferencias | ID: id_usuario | Bucket: inkacorp
            const uploadRes = await window.uploadImageToStorage(file, 'caja/transferencias', loggedInUser.id, 'inkacorp');
            
            if (!uploadRes.success) {
                throw new Error(uploadRes.error || 'Error al subir el comprobante.');
            }
            url_comprobante = uploadRes.url;
        }

        const { error } = await sb.from('ic_caja_transferencias').insert({
            id_usuario_origen: loggedInUser.id,
            id_usuario_destino: id_destino,
            monto: monto,
            descripcion: descripcion,
            comprobante_url: url_comprobante
        });

        if (error) throw error;

        closeModal('modal-transferencia-caja');
        document.getElementById('form-transferencia-caja').reset();
        
        await loadCajaData(); // Refrescar para ver el EGRESO
        
        Swal.fire({ icon: 'success', title: 'Dinero Enviado', text: 'Se ha registrado el egreso. Tu compañero será notificado.' });
    } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo enviar la transferencia: ' + err.message });
    }
}

/** 
 * TRANSFERENCIA INTER-CAJAS (RECIBIR)
 */
async function checkIncomingTransfer() {
    const sb = getSupabaseClient();
    if (!sb || !loggedInUser) return;

    try {
        const { data: incoming, error } = await sb.from('ic_caja_transferencias')
            .select('*, id_usuario_origen(nombre)')
            .eq('id_usuario_destino', loggedInUser.id)
            .eq('estado', 'PENDIENTE')
            .order('fecha_envio', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) throw error;

        const alertContainer = document.getElementById('transfer-alert-container');
        if (!alertContainer) return; // Salir si no estamos en la vista de caja

        if (incoming) {
            currentPendingTransfer = incoming;
            const alertMsg = document.getElementById('transfer-alert-msg');
            if (alertMsg) alertMsg.textContent = `Compañero ${incoming.id_usuario_origen.nombre} te ha enviado ${formatCurrency(incoming.monto)}.`;
            alertContainer.classList.remove('hidden');
        } else {
            currentPendingTransfer = null;
            alertContainer.classList.add('hidden');
        }
    } catch (err) {
        console.error("[CAJA] Error verificando transferencias entrantes:", err);
    }
}

function showAceptarTransferModal() {
    if (!currentPendingTransfer) return;

    document.getElementById('recibir-origen').textContent = currentPendingTransfer.id_usuario_origen.nombre;
    document.getElementById('recibir-monto').textContent = formatCurrency(currentPendingTransfer.monto);
    document.getElementById('recibir-descripcion').textContent = currentPendingTransfer.descripcion || 'Sin descripción';

    const compContainer = document.getElementById('recibir-comprobante-container');
    if (currentPendingTransfer.comprobante_url) {
        document.getElementById('recibir-comprobante-img').src = currentPendingTransfer.comprobante_url;
        document.getElementById('recibir-comprobante-link').href = currentPendingTransfer.comprobante_url;
        compContainer.classList.remove('hidden');
    } else {
        compContainer.classList.add('hidden');
    }

    showModal('modal-aceptar-transferencia');
}

async function handleProcesarTransferencia(nuevoEstado) {
    if (!currentPendingTransfer) return;
    const sb = getSupabaseClient();

    // 1. Si intenta ACEPTAR, debemos tener NO una caja cualquiera, sino la NUESTRA abierta
    if (nuevoEstado === 'ACEPTADA') {
        const { data: ownSession } = await sb
            .from('ic_caja_aperturas')
            .select('id_apertura, estado')
            .eq('id_usuario', loggedInUser.id)
            .eq('estado', 'ABIERTA')
            .maybeSingle();

        if (!ownSession) {
            Swal.fire({ 
                icon: 'warning', 
                title: 'Caja Cerrada', 
                text: 'Debes tener TU propia caja ABIERTA en otra pestaña para poder recibir e ingresar estos fondos en el sistema.' 
            });
            return;
        }
    }

    try {
        Swal.fire({ title: 'Procesando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const { error } = await sb.from('ic_caja_transferencias')
            .update({ estado: nuevoEstado })
            .eq('id_transferencia', currentPendingTransfer.id_transferencia);

        if (error) throw error;

        closeModal('modal-aceptar-transferencia');
        
        await checkIncomingTransfer(); // Ocultar alerta
        await loadCajaData(); // Refrescar movimientos

        Swal.fire({ 
            icon: nuevoEstado === 'ACEPTADA' ? 'success' : 'info', 
            title: nuevoEstado === 'ACEPTADA' ? 'Dinero Ingresado' : 'Transferencia Rechazada',
            text: nuevoEstado === 'ACEPTADA' ? 'El monto ha sido sumado a tu caja.' : 'La transacción ha sido anulada en ambas cajas.'
        });
    } catch (err) {
        console.error(err);
        Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo procesar: ' + err.message });
    }
}

/**
 * Actualiza el texto visible del file input customizado
 */
function updateFileName(input) {
    const display = document.getElementById('file-name-display');
    if (!display) return;

    if (input.files && input.files[0]) {
        const file = input.files[0];
        // Validar tamaño (5MB)
        if (file.size > 5 * 1024 * 1024) {
            Swal.fire({ icon: 'warning', title: 'Archivo muy grande', text: 'El archivo no debe superar los 5MB.' });
            input.value = '';
            display.textContent = 'Haz clic o arrastra una imagen';
            return;
        }
        display.textContent = file.name;
        display.parentElement.classList.add('has-file');
    } else {
        display.textContent = 'Haz clic o arrastra una imagen';
        display.parentElement.classList.remove('has-file');
    }
}

function renderMovimientosTable(movimientos) {
    const tbody = document.getElementById('caja-movimientos-body');
    if (!tbody) return;

    if (!movimientos || movimientos.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5">
            <div class="empty-state"><i class="fas fa-receipt fa-3x" style="opacity:0.2; margin-bottom:1rem; display:block;"></i><p>Sin movimientos aún</p></div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = movimientos.map(m => `
        <tr>
            <td>
                <div class="date-cell">
                    <span class="main-date">${new Date(m.fecha_movimiento).toLocaleDateString()}</span>
                    <span class="sub-date" style="font-size:0.75rem; color:var(--gray-400);">${new Date(m.fecha_movimiento).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
            </td>
            <td><span class="badge-v2 bg-light">${(m.categoria || 'MANUAL').replace('_', ' ')}</span></td>
            <td><strong style="display:block;">${m.descripcion || 'Sin descripción'}</strong><small style="color:var(--gray-400)">Ref: ${m.id_referencia || 'N/A'}</small></td>
            <td><span class="pago-method"><i class="fas fa-university"></i> ${m.metodo_pago}</span></td>
            <td class="text-right ${m.tipo_movimiento === 'INGRESO' ? 'text-success' : 'text-danger'}" style="font-weight:700;">
                ${m.tipo_movimiento === 'INGRESO' ? '+' : '-'} ${formatCurrency(m.monto)}
            </td>
            <td class="text-center">
                ${m.comprobante_url ? `<button onclick="window.open('${m.comprobante_url}', '_blank')" class="btn-icon-v2" title="Ver Comprobante"><i class="fas fa-eye"></i></button>` : '---'}
            </td>
        </tr>
    `).join('');
}

/**
 * Acciones de Usuario
 */

function showAperturaModal() {
    const modal = document.getElementById('modal-apertura-caja');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
}

async function handleAperturaCaja(e) {
    e.preventDefault();
    const sb = getSupabaseClient();
    const formData = new FormData(e.target);
    const saldoInicial = parseFloat(formData.get('saldo_inicial'));
    const observaciones = formData.get('observaciones');
    
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return;

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
        closeModal('modal-apertura-caja');
        e.target.reset();
        toggleCajaLayout('open');
        await loadCajaData();
        
        showNotif("Éxito", "Caja abierta correctamente", "success");
    } catch (e) {
        showNotif("Error", e.message, "error");
    }
}

function showMovimientoManualModal(tipo) {
    const modal = document.getElementById('modal-movimiento-manual');
    const title = document.getElementById('manual-modal-title');
    const typeField = document.getElementById('manual-tipo');
    
    // Resetear a transferencia por defecto
    const firstChip = document.querySelector('.method-chip');
    if (firstChip) selectManualMethod(firstChip, 'TRANSFERENCIA');

    if (typeField) typeField.value = tipo;
    if (title) title.innerHTML = tipo === 'INGRESO' 
        ? '<i class="fas fa-plus-circle text-success"></i> Nuevo Ingreso Manual' 
        : '<i class="fas fa-minus-circle text-danger"></i> Nuevo Egreso Manual';
    
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
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
    const file = document.getElementById('manual-comprobante')?.files[0];

    const { data: { session } } = await sb.auth.getSession();

    try {
        let comprobanteUrl = null;
        if (file) {
            statusText.textContent = 'Subiendo comprobante...';
            // Usamos la utilidad centralizada para consistencia y compresión
            const uploadRes = await window.uploadFileToStorage(file, 'caja', session.user.id);
            
            if (!uploadRes.success) {
                throw new Error(uploadRes.error);
            }
            
            comprobanteUrl = uploadRes.url;
        }

        const { error } = await sb
            .from(MOVIMIENTOS_TABLE)
            .insert([{
                id_apertura: currentCajaSession.id_apertura,
                tipo_movimiento: tipo,
                monto: monto,
                descripcion: desc,
                metodo_pago: metodo,
                comprobante_url: comprobanteUrl,
                categoria: tipo === 'INGRESO' ? 'INCREMENTO_EXTERNO' : 'RETIRO_EXTERNO',
                id_usuario: session.user.id,
                fecha_movimiento: new Date().toISOString()
            }]);

        if (error) throw error;

        closeModal('modal-movimiento-manual');
        e.target.reset();
        await loadCajaData();
        showNotif("Registrado", `Se ha registrado el ${tipo.toLowerCase()} correctamente.`, "success");
    } catch (e) {
        showNotif("Error", e.message, "error");
    }
}

function showCierreModal() {
    const modal = document.getElementById('modal-cierre-caja');
    const label = document.getElementById('cierre-saldo-previsto');
    if (label) label.textContent = formatCurrency(currentBalance);
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
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
                observaciones: (currentCajaSession.observaciones || '') + ' | CIERRE: ' + observaciones,
                fecha_cierre: new Date().toISOString(),
                estado: 'CERRADA'
            })
            .eq('id_apertura', currentCajaSession.id_apertura);

        if (error) throw error;

        closeModal('modal-cierre-caja');
        currentCajaSession = null;
        toggleCajaLayout('closed');
        showNotif("Caja Cerrada", "El arqueo de caja se ha procesado con éxito.", "info");
    } catch (e) {
        showNotif("Error", e.message, "error");
    }
}

// Helpers
function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val || 0);
}

function showModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        
        // Remove modal-open only if there are no other visible modals
        const visibleModals = document.querySelectorAll('.modal:not(.hidden)');
        if (visibleModals.length === 0) {
            document.body.classList.remove('modal-open');
        }
    }
}

/**
 * Historial de Sesiones (Aperturas y Cierres)
 */
async function showHistorialSesiones() {
    const modal = document.getElementById('modal-historial-sesiones');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.classList.add('modal-open');
        await loadHistorialSesiones();
    }
}

async function loadHistorialSesiones() {
    const sb = getSupabaseClient();
    if (!sb) return;

    try {
        const { data, error } = await sb
            .from(CAJA_TABLE)
            .select('*')
            .eq('id_usuario', currentSessionUser)
            .order('fecha_apertura', { ascending: false })
            .limit(50);

        if (error) throw error;
        renderHistorialSesionesTable(data);
    } catch (error) {
        console.error("[CAJA] Error cargando historial de sesiones:", error);
    }
}

function renderHistorialSesionesTable(data) {
    const tbody = document.getElementById('historial-sesiones-body');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5">No hay historial de sesiones aún</td></tr>';
        return;
    }

    tbody.innerHTML = data.map(s => {
        const fechaAp = new Date(s.fecha_apertura);
        const fechaCi = s.fecha_cierre ? new Date(s.fecha_cierre) : null;
        
        return `
            <tr>
                <td data-label="Fecha">
                    <strong style="color:var(--white);">${fechaAp.toLocaleDateString()}</strong>
                </td>
                <td data-label="Apertura / Cierre">
                    <div class="d-flex flex-column" style="gap:4px;">
                        <span style="font-size: 0.85rem;"><i class="fas fa-arrow-right text-success mr-2" style="width:14px;"></i> Inició: ${fechaAp.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        ${fechaCi ? `<span style="font-size: 0.85rem;"><i class="fas fa-arrow-left text-danger mr-2" style="width:14px;"></i> Cerró: ${fechaCi.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>` : '<span class="text-warning" style="font-size: 0.85rem;"><i class="fas fa-spinner fa-spin mr-2"></i>Sesión Activa</span>'}
                    </div>
                </td>
                <td data-label="Inicial / Final" class="text-right">
                    <div class="d-flex flex-column font-weight-bold" style="gap:4px;">
                        <span class="text-muted" style="font-size:0.75rem;">Bal. I: ${formatCurrency(s.saldo_inicial)}</span>
                        <span class="${s.estado === 'ABIERTA' ? 'text-warning' : 'text-white'}" style="font-size: 0.9rem;">${fechaCi ? 'Bal. F: ' + formatCurrency(s.saldo_final) : '---'}</span>
                    </div>
                </td>
                <td data-label="Estado" class="text-center">
                    <span class="badge-v2" style="background:${s.estado === 'ABIERTA' ? 'rgba(255,193,7,0.1)' : 'rgba(32,201,151,0.1)'}; color:${s.estado === 'ABIERTA' ? '#ffc107' : '#20c997'}; border:1px solid currentColor; padding: 4px 10px; border-radius: 12px; font-size: 0.7rem; font-weight: 700;">
                        ${s.estado === 'ABIERTA' ? '<i class="fas fa-unlock-alt mr-1"></i>ACTIVA' : '<i class="fas fa-check-circle mr-1"></i>CERRADA'}
                    </span>
                </td>
                <td data-label="Observaciones">
                    <small class="text-muted" style="max-width: 200px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${s.observaciones || ''}">
                        ${s.observaciones || '---'}
                    </small>
                </td>
            </tr>
        `;
    }).join('');
}

function showNotif(title, text, icon) {
    if (typeof Swal !== 'undefined') {
        Swal.fire(title, text, icon);
    } else {
        alert(`${title}: ${text}`);
    }
}

function updateMovimientosTitle(start, end) {
    const titleEl = document.getElementById('caja-movimientos-title');
    if (!titleEl) return;

    if (!start || !end) {
        titleEl.textContent = "Movimientos Recientes";
        return;
    }

    const startDate = new Date(start + 'T00:00:00');
    const endDate = new Date(end + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const isTodayIncluded = endDate >= today && startDate <= today;

    const options = { day: 'numeric', month: 'short', year: 'numeric' };
    const startStr = startDate.toLocaleDateString('es-ES', options);
    const endStr = endDate.toLocaleDateString('es-ES', options);

    if (isTodayIncluded) {
        // Calcular diferencia de días para el "últimos X días"
        const diffTime = Math.abs(endDate - startDate);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        
        if (diffDays === 1 && startDate.getTime() === today.getTime()) {
            titleEl.textContent = "Movimientos de Hoy";
        } else {
            titleEl.textContent = `Movimientos de los últimos ${diffDays} días (Incluye hoy)`;
        }
    } else {
        titleEl.textContent = `Movimientos del ${startStr} al ${endStr}`;
    }
}

/**
 * Maneja la selección visual de métodos de movimiento
 */
function selectManualMethod(element, value) {
    // Quitar activa de todos
    const chips = document.querySelectorAll('.method-chip');
    chips.forEach(c => c.classList.remove('active'));
    
    // Activar el seleccionado
    element.classList.add('active');
    
    // Actualizar input oculto
    const input = document.getElementById('manual-metodo-pago');
    if (input) input.value = value;
}

/**
 * Modal Reporte PDF
 */
function showReportePdfModal() {
    const modal = document.getElementById('modal-reporte-pdf');
    if (!modal) return;

    // Set default dates (today and 1 month ago)
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);
    
    document.getElementById('reporte-inicio').value = oneMonthAgo.toISOString().split('T')[0];
    document.getElementById('reporte-fin').value = today.toISOString().split('T')[0];

    // Load users if admin
    const userSelect = document.getElementById('reporte-usuario');
    if (userSelect && loggedInUser?.rol === 'admin') {
        const sb = getSupabaseClient();
        sb.from('ic_users').select('id, nombre').eq('activo', true).order('nombre')
            .then(({ data }) => {
                if (data) {
                    let options = '<option value="all">TODOS LOS USUARIOS</option>';
                    // Prioritize current user
                    const sorted = [...data].sort((a,b) => {
                        if (a.id === loggedInUser.id) return -1;
                        if (b.id === loggedInUser.id) return 1;
                        return a.nombre.localeCompare(b.nombre);
                    });
                    
                    options += sorted.map(u => `<option value="${u.id}" ${u.id === currentSessionUser ? 'selected' : ''}>${u.id === loggedInUser.id ? 'Mi Caja ('+u.nombre+')' : u.nombre}</option>`).join('');
                    userSelect.innerHTML = options;
                }
            });
        document.getElementById('reporte-user-group').classList.remove('hidden');
    } else {
        document.getElementById('reporte-user-group').classList.add('hidden');
    }

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

function updateReportOptionStyle(radio) {
    const options = document.querySelectorAll('.report-option');
    options.forEach(o => o.classList.remove('active'));
    radio.closest('.report-option').classList.add('active');
}

async function handleGenerarReportePdf(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const filters = {
        inicio: formData.get('fecha_inicio'),
        fin: formData.get('fecha_fin'),
        id_usuario: formData.get('id_usuario'),
        tipo: formData.get('tipo_movimiento'),
        formato: formData.get('formato')
    };

    if (loggedInUser.rol !== 'admin') {
        filters.id_usuario = loggedInUser.id;
    }

    try {
        if (typeof window.enableLoader === 'function') window.enableLoader();
        window.showLoader?.('Preparando datos del reporte...');
        
        await generateElegantCajaReport(filters);
        
        closeModal('modal-reporte-pdf');
        window.hideLoader?.();
    } catch (err) {
        console.error("Error generating PDF:", err);
        window.hideLoader?.();
        showNotif("Error", err.message, "error");
    }
}

async function generateElegantCajaReport(filters) {
    const sb = getSupabaseClient();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    // 1. Fetch Data
    let query = sb.from(MOVIMIENTOS_TABLE)
        .select(`*, ic_users (nombre)`)
        .gte('fecha_movimiento', `${filters.inicio}T00:00:00`)
        .lte('fecha_movimiento', `${filters.fin}T23:59:59`);

    if (filters.id_usuario !== 'all') {
        query = query.eq('id_usuario', filters.id_usuario);
    }
    
    if (filters.tipo !== 'TODOS') {
        query = query.eq('tipo_movimiento', filters.tipo);
    }

    const { data: movs, error } = await query.order('fecha_movimiento', { ascending: true });
    if (error) throw error;
    if (!movs || movs.length === 0) throw new Error("No se encontraron movimientos para los filtros seleccionados.");

    // Grouping logic if 'all' users
    let groupedData = {};
    if (filters.id_usuario === 'all') {
        movs.forEach(m => {
            const userName = m.ic_users?.nombre || 'Desconocido';
            if (!groupedData[userName]) groupedData[userName] = [];
            groupedData[userName].push(m);
        });
    } else {
        const userName = movs[0].ic_users?.nombre || 'Usuario';
        groupedData[userName] = movs;
    }

    // PDF Configuration Constants
    const verdeInka = [11, 78, 50];
    const doradoInka = [242, 187, 58];
    const slate500 = [100, 116, 139];
    const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';

    const renderHeader = (userName) => {
        try { doc.addImage(logoUrl, 'PNG', 15, 12, 18, 18); } catch(e){}
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...verdeInka);
        doc.text("INKA CORP", 38, 18);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...slate500);
        doc.text(`REPORTE DE CAJA: ${userName.toUpperCase()}`, 38, 24);

        const now = new Date();
        doc.setFontSize(8);
        doc.text(`Generado: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`, 145, 18);
        doc.text(`Filtro: ${filters.inicio} al ${filters.fin}`, 145, 23);

        doc.setDrawColor(...doradoInka);
        doc.setLineWidth(0.5);
        doc.line(15, 30, 195, 30);
    };

    const userNames = Object.keys(groupedData).sort();
    
    userNames.forEach((userName, index) => {
        if (index > 0) doc.addPage();
        
        const userMovs = groupedData[userName];
        renderHeader(userName);

        // Calculate User stats
        let uIngresos = 0, uEgresos = 0;
        userMovs.forEach(m => {
            if (m.tipo_movimiento === 'INGRESO') uIngresos += parseFloat(m.monto);
            else uEgresos += parseFloat(m.monto);
        });

        // Summary for this user
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...verdeInka);
        doc.text("RESUMEN DE MOVIMIENTOS", 15, 40);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        doc.text(`Total Ingresos:`, 15, 48);
        doc.text(`${formatCurrency(uIngresos)}`, 45, 48);
        
        doc.text(`Total Egresos:`, 75, 48);
        doc.text(`${formatCurrency(uEgresos)}`, 105, 48);
        
        doc.setFont('helvetica', 'bold');
        doc.text(`SALDO NETO:`, 140, 48);
        doc.text(`${formatCurrency(uIngresos - uEgresos)}`, 170, 48);

        // Table
        if (filters.formato === 'DETALLADO') {
            const tableBody = userMovs.map(m => [
                new Date(m.fecha_movimiento).toLocaleDateString() + ' ' + new Date(m.fecha_movimiento).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}),
                m.categoria?.replace('_', ' ') || 'MANUAL',
                m.descripcion || '---',
                m.metodo_pago,
                { content: formatCurrency(m.monto), styles: { textColor: m.tipo_movimiento === 'INGRESO' ? [0, 128, 0] : [200, 0, 0], fontStyle: 'bold', halign: 'right' } }
            ]);

            doc.autoTable({
                startY: 55,
                head: [['Fecha/Hora', 'Categoría', 'Descripción', 'Método', 'Monto']],
                body: tableBody,
                headStyles: { fillColor: verdeInka, textColor: [255, 255, 255], fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                margin: { left: 15, right: 15 },
                styles: { fontSize: 8, cellPadding: 2 },
                columnStyles: {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 30 },
                    3: { cellWidth: 30 },
                    4: { cellWidth: 30 }
                }
            });
        } else {
            // RESUMIDO: Group by Category for THIS user
            const group = {};
            userMovs.forEach(m => {
                const cat = m.categoria || 'MANUAL';
                if (!group[cat]) group[cat] = { ingreso: 0, egreso: 0, count: 0 };
                if (m.tipo_movimiento === 'INGRESO') group[cat].ingreso += parseFloat(m.monto);
                else group[cat].egreso += parseFloat(m.monto);
                group[cat].count++;
            });

            const tableBody = Object.keys(group).sort().map(cat => [
                cat.replace('_', ' '),
                group[cat].count,
                formatCurrency(group[cat].ingreso),
                formatCurrency(group[cat].egreso),
                formatCurrency(group[cat].ingreso - group[cat].egreso)
            ]);

            doc.autoTable({
                startY: 55,
                head: [['Categoría', 'Movs', 'Ingresos', 'Egresos', 'Neto']],
                body: tableBody,
                headStyles: { fillColor: verdeInka, textColor: [255, 255, 255], fontStyle: 'bold' },
                styles: { fontSize: 9, cellPadding: 4 },
                columnStyles: {
                    1: { halign: 'center' },
                    2: { halign: 'right' },
                    3: { halign: 'right' },
                    4: { halign: 'right', fontStyle: 'bold' }
                }
            });
        }

        const currentFinalY = doc.lastAutoTable.finalY;
        doc.setFontSize(8);
        doc.setTextColor(...slate500);
        doc.text(`Fin del reporte para ${userName} - Pág. ${doc.internal.getNumberOfPages()}`, 15, currentFinalY + 10);
    });

    // Save
    const fileName = `Reporte_Caja_${filters.id_usuario === 'all' ? 'Multiusuario' : filters.id_usuario}_${filters.inicio}_al_${filters.fin}.pdf`;
    doc.save(fileName);
}

/**
 * PDF Generation - Keep for proposal download
 */
async function generateCajaProposalPDF() {
    try {
        const jspdfRef = window.jspdf;
        if (!jspdfRef || !jspdfRef.jsPDF) {
            window.showAlert?.('No se encontró la librería de PDF en esta vista.', 'Error', 'error');
            return;
        }

        const { jsPDF } = jspdfRef;
        const doc = new jsPDF({ unit: 'pt', format: 'a4' });
        // (Functionality for proposal... placeholder)
    } catch (err) {
        console.error("Error generating PDF", err);
    }
}

// Global Exports
window.initCajaModule = initCajaModule;
window.showAperturaModal = showAperturaModal;
window.handleAperturaCaja = handleAperturaCaja;
window.showMovimientoManualModal = showMovimientoManualModal;
window.handleMovimientoManual = handleMovimientoManual;
window.showCierreModal = showCierreModal;
window.handleCierreCaja = handleCierreCaja;
window.loadCajaData = loadCajaData;
window.closeModal = closeModal;
window.showHistorialSesiones = showHistorialSesiones;
window.selectManualMethod = selectManualMethod;
window.generateCajaProposalPDF = generateCajaProposalPDF;
window.switchUserCaja = switchUserCaja;
window.showReportePdfModal = showReportePdfModal;
window.handleGenerarReportePdf = handleGenerarReportePdf;
window.updateReportOptionStyle = updateReportOptionStyle;

// Transferencias
window.showTransferModal = showTransferModal;
window.handleEnviarTransferencia = handleEnviarTransferencia;
window.showAceptarTransferModal = showAceptarTransferModal;
window.handleProcesarTransferencia = handleProcesarTransferencia;
window.updateFileName = updateFileName;

// Caja Module initialized.

