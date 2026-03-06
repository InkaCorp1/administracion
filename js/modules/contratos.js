/**
 * INKA CORP - Módulo de Contratos
 * Gestión de contratos institucionales y externos.
 */

// Estado del módulo
let contratosData = [];
let contratoImageFile = null;

/**
 * Inicializa el módulo de Contratos
 */
async function initContratosModule() {
    console.log('Inicializando módulo de Contratos...');
    
    // Configurar event listeners PRIMERO e INMEDIATAMENTE
    setupContratosEventListeners();
    
    // Luego verificar vista y cargar datos
    const grid = document.getElementById('contratos-grid');
    if (!grid) {
        console.warn('Vista de Contratos no encontrada en el DOM.');
        return;
    }

    // Cargar datos iniciales
    loadContratosData();
}

/**
 * Configura los event listeners del módulo
 */
function setupContratosEventListeners() {
    // Botón Registrar (Abre modal) - Usar delegación o asegurar búsqueda
    const btnRegistrar = document.getElementById('btn-registrar-contrato');
    if (btnRegistrar) {
        btnRegistrar.onclick = (e) => {
            if (e) e.preventDefault();
            console.log('Click en registrar contrato detectado');
            resetContratoForm();
            openContratoModal();
        };
    } else {
        // Intento de respaldo si el ID no se encuentra de inmediato
        setTimeout(() => {
            const btn = document.getElementById('btn-registrar-contrato');
            if (btn) btn.onclick = () => { resetContratoForm(); openContratoModal(); };
        }, 500);
    }

    // Búsqueda
    const searchInput = document.getElementById('contratos-search');
    if (searchInput) {
        searchInput.oninput = (e) => filterContratos();
    }

    // Filtros
    const filterPais = document.getElementById('filter-pais');
    const filterTipo = document.getElementById('filter-tipo');
    if (filterPais) filterPais.onchange = () => filterContratos();
    if (filterTipo) filterTipo.onchange = () => filterContratos();

    // Toggle Buttons (Nosotros/Otro)
    const toggleBtns = document.querySelectorAll('.btn-toggle');
    toggleBtns.forEach(btn => {
        btn.onclick = () => {
            toggleBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const parteInput = document.getElementById('parte_contrato');
            if (parteInput) parteInput.value = btn.dataset.value;
        };
    });

    // Manejo de Archivo
    const fileInput = document.getElementById('file-contrato');
    const dropArea = document.getElementById('drop-area-contrato');

    if (dropArea && fileInput) {
        dropArea.onclick = () => fileInput.click();
        fileInput.onchange = (e) => {
            if (e.target.files[0]) handleContratoImageSelected(e.target.files[0]);
        };
    }

    const btnRemoveImg = document.getElementById('btn-remove-img');
    if (btnRemoveImg) {
        btnRemoveImg.onclick = clearContratoImagePreview;
    }

    // Formulario de envío
    const form = document.getElementById('form-contrato');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            await saveContrato();
        };
    }

    // Sincronizar fecha fin al cambiar fecha contrato
    const fechaInicio = document.getElementById('fecha_contrato');
    if (fechaInicio) {
        fechaInicio.onchange = calculateEndDate;
    }
}

/**
 * Carga los contratos desde Supabase
 */
async function loadContratosData(forceRefresh = false) {
    try {
        if (!forceRefresh && window.hasCacheData('contratos')) {
            contratosData = window.getCacheData('contratos');
            updateContratoStats(contratosData);
            renderContratosCards(contratosData);
            // Si el caché es viejo, actualizar en background
            if (!window.isCacheValid('contratos')) {
                fetchContratosFromDB();
            }
            return;
        }

        await fetchContratosFromDB();
    } catch (error) {
        console.error('Error al cargar contratos:', error);
    }
}

/**
 * Actualiza los contadores del Hero
 */
function updateContratoStats(data) {
    const totalEl = document.getElementById('stat-total-contratos');
    const activosEl = document.getElementById('stat-contratos-activos');
    
    if (!totalEl || !activosEl) return;
    
    const total = data.length;
    const activos = data.filter(c => new Date(c.fecha_fin) >= new Date()).length;
    
    totalEl.innerText = total;
    activosEl.innerText = activos;
}

async function fetchContratosFromDB() {
    const grid = document.getElementById('contratos-grid');
    const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof supabase !== 'undefined' ? supabase : null);
    
    if (!sb || typeof sb.from !== 'function') {
        console.error('fetchContratosFromDB: Cliente de Supabase no disponible o mal configurado');
        if (grid) grid.innerHTML = `<p class="error-msg">Error: Sistema de datos no disponible.</p>`;
        return;
    }

    try {
        const { data, error } = await sb
            .from('ic_contratos')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        contratosData = data || [];
        window.setCacheData('contratos', contratosData);
        updateContratoStats(contratosData);
        renderContratosCards(contratosData);
    } catch (error) {
        console.error('fetchContratosFromDB: Error:', error);
        let msg = `Error al cargar datos: ${error.message}`;
        let isCacheError = error.code === 'PGRST205' || (error.message && error.message.includes('schema cache'));
        
        if (isCacheError) {
            msg = `
                <div class="cache-error-container">
                    <i class="fas fa-sync-alt fa-spin"></i>
                    <h3>Sincronizando Sistema de Datos</h3>
                    <p>La nueva tabla de contratos se está activando en el servidor.</p>
                    <div class="cache-error-actions">
                        <button class="btn btn-secondary" onclick="loadContratosData(true)">
                            <i class="fas fa-redo"></i> Reintentar Carga
                        </button>
                        <p class="small-hint">Si el error persiste, presiona <b>Ctrl + F5</b></p>
                    </div>
                </div>
            `;
        }
        if (grid) grid.innerHTML = `<div class="error-msg-wrapper">${msg}</div>`;
    }
}

/**
 * Renderiza las tarjetas de contratos
 */
function renderContratosCards(data) {
    const grid = document.getElementById('contratos-grid');
    if (!grid) return;

    if (grid.querySelector('.loading-state')) {
        grid.innerHTML = '';
    }

    if (!data || data.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-file-contract"></i>
                <p>No hay contratos registrados.</p>
            </div>`;
        return;
    }

    grid.innerHTML = data.map(contrato => {
        const isExpired = new Date(contrato.fecha_fin) < new Date();
        const statusClass = isExpired ? 'status-expired' : 'status-active';
        const statusText = isExpired ? 'Vencido' : 'Activo';
        const typeClass = contrato.parte_contrato === 'Nosotros' ? 'type-nosotros' : 'type-otro';
        
        return `
            <div class="contrato-card">
                <div class="contrato-card-header">
                    <div>
                        <span class="contrato-type-tag ${typeClass}">${contrato.parte_contrato.toUpperCase()}</span>
                        <span class="contrato-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="card-actions">
                        <button class="btn-icon btn-delete" onclick="deleteContrato('${contrato.id}')" title="Eliminar">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
                <div class="contrato-card-body">
                    <h3>${contrato.nombre_razon}</h3>
                    <span class="contrato-id-ruc">${contrato.cedula_ruc}</span>
                    <p class="contrato-detail">${contrato.detalle}</p>
                    
                    <div class="contrato-info-grid">
                        <div class="info-item">
                            <span class="info-label">Monto</span>
                            <span class="info-value">$${parseFloat(contrato.monto).toLocaleString('en-US', {minimumFractionDigits: 2})}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">País</span>
                            <span class="info-value">${contrato.pais}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Inicio</span>
                            <span class="info-value">${new Date(contrato.fecha_contrato).toLocaleDateString()}</span>
                        </div>
                        <div class="info-item">
                            <span class="info-label">Fin</span>
                            <span class="info-value">${new Date(contrato.fecha_fin).toLocaleDateString()}</span>
                        </div>
                    </div>
                </div>
                <div class="contrato-card-footer">
                    <span class="info-label">Frecuencia: ${contrato.frecuencia} (${contrato.cantidad_duracion})</span>
                    ${contrato.url_foto ? `
                        <button class="btn btn-secondary btn-sm" onclick="viewContratoImage('${contrato.url_foto}')">
                            <i class="fas fa-image"></i> Ver Foto
                        </button>
                    ` : '<span class="info-label">Sin foto</span>'}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Filtra los contratos según búsqueda y selects
 */
function filterContratos() {
    const search = document.getElementById('contratos-search').value.toLowerCase();
    const pais = document.getElementById('filter-pais').value;
    const tipo = document.getElementById('filter-tipo').value;

    const filtered = contratosData.filter(c => {
        const matchesSearch = c.nombre_razon.toLowerCase().includes(search) || 
                              c.cedula_ruc.includes(search) || 
                              c.detalle.toLowerCase().includes(search);
        const matchesPais = !pais || c.pais === pais;
        const matchesTipo = !tipo || c.parte_contrato === tipo;
        
        return matchesSearch && matchesPais && matchesTipo;
    });

    renderContratosCards(filtered);
}

/**
 * Manejo de la imagen del contrato
 */
async function handleContratoImageSelected(file) {
    if (!file) return;
    
    // Validar tipo
    if (!file.type.startsWith('image/')) {
        Swal.fire('Error', 'Por favor selecciona un archivo de imagen.', 'error');
        return;
    }

    contratoImageFile = file;
    
    // Mostrar preview
    const previewContainer = document.getElementById('preview-container-contrato');
    const dropArea = document.getElementById('drop-area-contrato');
    const previewImg = document.getElementById('preview-contrato');
    
    await window.showImagePreview(file, previewImg);
    
    dropArea.classList.add('hidden');
    previewContainer.classList.remove('hidden');
}

function clearContratoImagePreview() {
    contratoImageFile = null;
    document.getElementById('file-contrato').value = '';
    document.getElementById('drop-area-contrato').classList.remove('hidden');
    document.getElementById('preview-container-contrato').classList.add('hidden');
    document.getElementById('preview-contrato').src = '';
}

/**
 * Calcula la fecha de fin basada en frecuencia y cantidad
 */
function handleFrecuenciaChange() {
    const freq = document.getElementById('frecuencia_contrato').value;
    const label = document.getElementById('label-duracion');
    
    if (freq === 'anual') label.innerText = 'Cantidad (Años)';
    else if (freq === 'mensual') label.innerText = 'Cantidad (Meses)';
    else label.innerText = 'Cantidad (Días)';
    
    calculateEndDate();
}

function calculateEndDate() {
    const fechaIni = document.getElementById('fecha_contrato').value;
    const freq = document.getElementById('frecuencia_contrato').value;
    const cant = parseInt(document.getElementById('cantidad_duracion').value) || 0;
    const fechaFinInput = document.getElementById('fecha_fin');

    if (!fechaIni || cant <= 0) return;

    let date = new Date(fechaIni + 'T00:00:00');
    
    if (freq === 'anual') date.setFullYear(date.getFullYear() + cant);
    else if (freq === 'mensual') date.setMonth(date.getMonth() + cant);
    else date.setDate(date.getDate() + cant);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    fechaFinInput.value = `${year}-${month}-${day}`;
}

/**
 * Guarda el contrato en Supabase
 */
async function saveContrato() {
    // Feedback inmediato
    Swal.fire({
        title: 'Guardando contrato...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const user = await window.getCurrentUser();
        if (!user) {
            Swal.fire('Error', 'Debes iniciar sesión para realizar esta acción.', 'error');
            return;
        }

        let imageUrl = null;
        const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof supabase !== 'undefined' ? supabase : null);

        if (!sb || typeof sb.from !== 'function') {
            throw new Error('Sistema de datos no disponible.');
        }

        // 1. Subir imagen si existe
        if (contratoImageFile) {
            const fileName = `contrato_${Date.now()}`;
            const uploadResult = await window.uploadImageToStorage(contratoImageFile, 'contratos', fileName);
            if (uploadResult.success) {
                imageUrl = uploadResult.url;
            } else {
                console.warn('No se pudo subir la imagen, se guardará sin ella:', uploadResult.error);
            }
        }

        // 2. Preparar datos
        const contratoObj = {
            fecha_contrato: document.getElementById('fecha_contrato').value,
            parte_contrato: document.getElementById('parte_contrato').value,
            nombre_razon: document.getElementById('nombre_razon').value,
            cedula_ruc: document.getElementById('cedula_ruc').value,
            pais: document.getElementById('pais_contrato').value,
            detalle: document.getElementById('detalle_contrato').value,
            monto: parseFloat(document.getElementById('monto_contrato').value),
            frecuencia: document.getElementById('frecuencia_contrato').value,
            cantidad_duracion: parseInt(document.getElementById('cantidad_duracion').value),
            fecha_fin: document.getElementById('fecha_fin').value,
            url_foto: imageUrl,
            creado_por: user.id
        };

        // 3. Insertar en DB
        const { error } = await sb.from('ic_contratos').insert([contratoObj]);

        if (error) throw error;

        Swal.fire('¡Éxito!', 'El contrato ha sido registrado correctamente.', 'success');
        closeContratoModal();
        await loadContratosData(true);

    } catch (error) {
        console.error('Error al guardar contrato:', error);
        Swal.fire('Error', 'No se pudo guardar el contrato: ' + error.message, 'error');
    }
}

/**
 * Elimina un contrato
 */
async function deleteContrato(id) {
    const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: "Esta acción no se puede deshacer.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#3085d6',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'Eliminando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        
        try {
            const sb = typeof getSupabaseClient === 'function' ? getSupabaseClient() : (typeof supabase !== 'undefined' ? supabase : null);
            if (!sb) throw new Error('Sistema de datos no disponible.');

            const { error } = await sb.from('ic_contratos').delete().eq('id', id);
            if (error) throw error;

            Swal.fire('Eliminado', 'El contrato ha sido eliminado.', 'success');
            await loadContratosData(true);
        } catch (error) {
            Swal.fire('Error', error.message, 'error');
        }
    }
}

/**
 * Utilidades de Modal
 */
function openContratoModal() {
    const modal = document.getElementById('modal-contrato');
    if (modal) modal.style.display = 'flex';
}

function closeContratoModal() {
    const modal = document.getElementById('modal-contrato');
    if (modal) modal.style.display = 'none';
    resetContratoForm();
}

function resetContratoForm() {
    const form = document.getElementById('form-contrato');
    if (form) form.reset();
    
    // Reset toggle
    const toggleBtns = document.querySelectorAll('.btn-toggle');
    toggleBtns.forEach(b => b.classList.remove('active'));
    
    const btnNosotros = document.getElementById('btn-nosotros');
    if (btnNosotros) btnNosotros.classList.add('active');
    
    const parteContrato = document.getElementById('parte_contrato');
    if (parteContrato) parteContrato.value = 'Nosotros';
    
    clearContratoImagePreview();
}

function viewContratoImage(url) {
    Swal.fire({
        imageUrl: url,
        imageAlt: 'Documento del Contrato',
        width: 'auto',
        showCloseButton: true,
        showConfirmButton: false
    });
}

// Exportar para uso de loadView
window.initContratosModule = initContratosModule;
window.closeContratoModal = closeContratoModal;
window.deleteContrato = deleteContrato;
window.viewContratoImage = viewContratoImage;
window.handleFrecuenciaChange = handleFrecuenciaChange;
window.calculateEndDate = calculateEndDate;
