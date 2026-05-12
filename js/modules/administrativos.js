/**
 * INKA CORP - Módulo Gastos Administrativos
 * Maneja el registro y visualización de gastos operativos internos.
 */

// Estado del módulo
let gastosAdmData = [];
let admImageFile = null;

/**
 * Inicializa el módulo de Gastos Administrativos
 */
async function initAdministrativosModule() {

    const tableBody = document.getElementById('adm-table-body');
    if (!tableBody) {
        console.warn('Vista de Gastos Administrativos no encontrada en el DOM.');
        return;
    }

    // Configurar event listeners
    setupAdmEventListeners();

    // Cargar datos iniciales
    await loadAdmData();
}

/**
 * Configura los event listeners del módulo
 */
function setupAdmEventListeners() {
    // Búsqueda
    const searchInput = document.getElementById('search-administrativos');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterAdmGastos(e.target.value);
        });
    }

    // Botón Sincronizar
    const refreshBtn = document.getElementById('refresh-administrativos');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', async () => {
            await loadAdmData(true);
        });
    }

    // Botón Nuevo Gasto (Abre modal)
    const btnNuevo = document.getElementById('btn-nuevo-gasto-adm');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => {
            resetAdmForm();
            openAdmModal();
        });
    }

    // Botón Reporte PDF
    const btnReporte = document.getElementById('btn-adm-reporte-pdf');
    if (btnReporte) {
        btnReporte.addEventListener('click', () => {
            generateAdmReportPDF();
        });
    }

    // Modal Close
    const closeButtons = document.querySelectorAll('#modal-gasto-adm [data-close-modal], #modal-evidencia-adm [data-close-modal]');
    closeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('modal-gasto-adm').classList.add('hidden');
            document.getElementById('modal-evidencia-adm').classList.add('hidden');
        });
    });

    // Manejo de Archivo/Imagen (Galería y Cámara)
    const fileInput = document.getElementById('adm-file-input');
    const cameraInput = document.getElementById('adm-camera-input');

    const handleFileChange = (e) => {
        if (e.target.files[0]) {
            handleAdmImageSelected(e.target.files[0]);
        }
    };

    if (fileInput) fileInput.addEventListener('change', handleFileChange);
    if (cameraInput) cameraInput.addEventListener('change', handleFileChange);

    const removePreviewBtn = document.getElementById('remove-adm-preview');
    if (removePreviewBtn) {
        removePreviewBtn.addEventListener('click', clearAdmImagePreview);
    }

    // Filtros de fecha
    const filterDesde = document.getElementById('filter-adm-desde');
    const filterHasta = document.getElementById('filter-adm-hasta');
    if (filterDesde) filterDesde.addEventListener('change', () => filterAdmByDateRange());
    if (filterHasta) filterHasta.addEventListener('change', () => filterAdmByDateRange());

    // Botón Ver Todo
    const btnVerTodo = document.getElementById('btn-adm-ver-todo');
    if (btnVerTodo) {
        btnVerTodo.addEventListener('click', () => {
            if (filterDesde) filterDesde.value = '';
            if (filterHasta) filterHasta.value = '';
            renderAdmTable(gastosAdmData);
            btnVerTodo.classList.add('hidden');
        });
    }

    // Formulario Submit
    const form = document.getElementById('form-gasto-adm');
    if (form) {
        form.addEventListener('submit', handleAdmFormSubmit);
    }
}

/**
 * Carga los datos desde Supabase
 */
async function loadAdmData(forceRefresh = false) {
    const tableBody = document.getElementById('adm-table-body');
    const emptyMsg = document.getElementById('adm-empty');

    if (!tableBody) return; // Evitar errores si la vista cambió rápido

    // PASO 1: Usar caché si está disponible y es válido
    if (!forceRefresh && window.hasCacheData && window.hasCacheData('administrativos')) {
        gastosAdmData = window.getCacheData('administrativos');
        renderAdmDataImmediate();

        // Si el caché es reciente, no re-consultar
        if (window.isCacheValid && window.isCacheValid('administrativos')) {
            return;
        }
    }

    if (!gastosAdmData.length) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 3rem;"><div class="spinner" style="margin: 0 auto 1rem;"></div><p>Cargando gastos...</p></td></tr>';
    }

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) throw new Error('Cliente Supabase no disponible');

        const { data, error } = await supabase
            .from('ic_gastos_administrativos')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) throw error;

        gastosAdmData = data || [];

        // Guardar en caché global
        if (window.setCacheData) {
            window.setCacheData('administrativos', gastosAdmData);
        }

        renderAdmDataImmediate();

    } catch (error) {
        console.error('Error al cargar gastos administrativos:', error);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red">Error: ${error.message}</td></tr>`;
        }
    }
}

/**
 * Función auxiliar para renderizar sin repetir código
 */
function renderAdmDataImmediate() {
    const filterDesde = document.getElementById('filter-adm-desde');
    const filterHasta = document.getElementById('filter-adm-hasta');
    const btnVerTodo = document.getElementById('btn-adm-ver-todo');
    const emptyMsg = document.getElementById('adm-empty');

    if (filterDesde && filterHasta) {
        if (!filterDesde.value && !filterHasta.value) {
            renderAdmTable(gastosAdmData.slice(0, 6));
            if (btnVerTodo) btnVerTodo.classList.remove('hidden');
        } else {
            filterAdmByDateRange();
        }
    } else {
        renderAdmTable(gastosAdmData.slice(0, 6));
    }

    updateAdmStats(gastosAdmData);

    if (gastosAdmData.length === 0) {
        if (emptyMsg) emptyMsg.classList.remove('hidden');
    } else {
        if (emptyMsg) emptyMsg.classList.add('hidden');
    }
}

/**
 * Renderiza la tabla de gastos
 */
function renderAdmTable(data) {
    const tableBody = document.getElementById('adm-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    data.forEach(gasto => {
        const tr = document.createElement('tr');
        tr.className = 'expense-row';

        const tieneFoto = gasto.fotografia && gasto.fotografia.trim() !== '';

        tr.innerHTML = `
            <td><span class="expense-date">${formatAdmDate(gasto.fecha)}</span></td>
            <td><div class="expense-reason">${gasto.motivo}</div></td>
            <td><span class="expense-amount">$${parseFloat(gasto.monto).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span></td>
            <td>
                ${tieneFoto ? `
                    <button class="btn-view-photo" onclick="viewAdmEvidencia('${gasto.fotografia}')">
                        <i class="fas fa-image"></i> Ver Foto
                    </button>
                ` : '<span style="color:var(--gray-300); font-size: 0.8rem">Sin evidencia</span>'}
            </td>
            <td>
                <button class="btn-delete-expense" onclick="deleteAdmGasto(event, '${gasto.id_gastos}')" title="Eliminar">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </td>
        `;

        // Agregar evento de click para editar (opcional, por ahora solo borrar y ver foto)
        // tr.onclick = () => editAdmGasto(gasto);

        tableBody.appendChild(tr);
    });
}

/**
 * Actualiza las estadísticas
 */
function updateAdmStats(data) {
    const totalCount = data.length;
    const totalMonto = data.reduce((sum, g) => sum + parseFloat(g.monto || 0), 0);

    // Calcular mes actual
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const mesMonto = data.reduce((sum, g) => {
        const d = new Date(g.fecha);
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
            return sum + parseFloat(g.monto || 0);
        }
        return sum;
    }, 0);

    document.getElementById('stat-adm-total-count').textContent = totalCount;
    document.getElementById('stat-adm-total-monto').textContent = '$' + totalMonto.toLocaleString('es-EC', { minimumFractionDigits: 2 });
    document.getElementById('stat-adm-mes-actual').textContent = '$' + mesMonto.toLocaleString('es-EC', { minimumFractionDigits: 2 });
}

/**
 * Filtra los gastos
 */
function filterAdmGastos(query) {
    const q = query.toLowerCase();
    const filtered = gastosAdmData.filter(g =>
        (g.motivo || '').toLowerCase().includes(q) ||
        (g.id_gastos || '').toLowerCase().includes(q)
    );
    renderAdmTable(filtered);
}

/**
 * Filtra los datos por el mes actual
 */
function filterByCurrentMonth(data) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    return data.filter(g => {
        const d = new Date(g.fecha);
        return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
}

/**
 * Filtra los gastos por rango de fechas
 */
function filterAdmByDateRange() {
    const elDesde = document.getElementById('filter-adm-desde');
    const elHasta = document.getElementById('filter-adm-hasta');
    const btnVerTodo = document.getElementById('btn-adm-ver-todo');

    if (!elDesde || !elHasta) return;

    const desde = elDesde.value;
    const hasta = elHasta.value;

    if (!desde && !hasta) {
        // Por defecto mostrar los últimos 6
        renderAdmTable(gastosAdmData.slice(0, 6));
        if (btnVerTodo) btnVerTodo.classList.remove('hidden');
        return;
    }

    let filtered = [...gastosAdmData];

    if (desde) {
        filtered = filtered.filter(g => g.fecha >= desde);
    }
    if (hasta) {
        filtered = filtered.filter(g => g.fecha <= hasta);
    }

    renderAdmTable(filtered);
    if (btnVerTodo) btnVerTodo.classList.remove('hidden');
}

/**
 * Abre el modal
 */
function openAdmModal() {
    // Validar estado de caja
    if (typeof window.validateCajaBeforeAction === 'function') {
        if (!window.validateCajaBeforeAction('MOVIMIENTO ADMINISTRATIVO')) return;
    }

    document.getElementById('modal-gasto-adm').classList.remove('hidden');
}

/**
 * Resetea el formulario
 */
function resetAdmForm() {
    const form = document.getElementById('form-gasto-adm');
    if (form) form.reset();

    document.getElementById('adm-id-gasto').value = '';
    document.getElementById('adm-fotografia-url').value = '';
    document.getElementById('adm-fecha').value = new Date().toISOString().split('T')[0];

    clearAdmImagePreview();
}

/**
 * Maneja la selección de imagen
 */
async function handleAdmImageSelected(file) {
    admImageFile = file;
    const preview = document.getElementById('adm-preview');
    const container = document.getElementById('adm-preview-container');
    const placeholder = document.getElementById('adm-upload-placeholder');

    try {
        await window.showImagePreview(file, preview);
        container.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } catch (err) {
        console.error('Error en preview:', err);
    }
}

/**
 * Limpia el preview
 */
function clearAdmImagePreview() {
    admImageFile = null;
    document.getElementById('adm-preview').src = '';
    document.getElementById('adm-preview-container').classList.add('hidden');
    document.getElementById('adm-upload-placeholder').classList.remove('hidden');
}

/**
 * Elmina un gasto
 */
async function deleteAdmGasto(event, id) {
    event.stopPropagation();

    const confirmed = await window.showConfirm(
        '¿Estás seguro de que deseas eliminar este registro de gasto?',
        'Eliminar Gasto',
        { type: 'danger', confirmText: 'Eliminar', cancelText: 'Cancelar' }
    );

    if (!confirmed) return;

    try {
        const supabase = window.getSupabaseClient();
        const { error } = await supabase
            .from('ic_gastos_administrativos')
            .delete()
            .eq('id_gastos', id);

        if (error) throw error;

        window.showToast('Gasto eliminado correctamente', 'success');
        await loadAdmData();

    } catch (err) {
        console.error('Error al eliminar:', err);
        window.showAlert('No se pudo eliminar: ' + err.message, 'Error', 'error');
    }
}

/**
 * Maneja el submit del formulario
 */
async function handleAdmFormSubmit(e) {
    e.preventDefault();

    const btnSave = document.getElementById('btn-save-gasto-adm');
    const originalText = btnSave.innerHTML;

    try {
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        const id_gastos = document.getElementById('adm-id-gasto').value || crypto.randomUUID();
        const monto = parseFloat(document.getElementById('adm-monto').value);
        const motivo = document.getElementById('adm-motivo').value;
        // Obtener la fecha del input y mantenerla en formato YYYY-MM-DD sin conversión de zona horaria
        const fechaInput = document.getElementById('adm-fecha').value;
        const fecha = fechaInput; // Se guarda directamente en formato DATE de PostgreSQL
        let fotografia = document.getElementById('adm-fotografia-url').value;

        // 1. Subir imagen si hay una seleccionada
        if (admImageFile) {
            btnSave.innerHTML = '<i class="fas fa-camera fa-spin"></i> Subiendo imagen...';
            // Carpeta: administrativos/gastos, ID: id_gastos, Bucket: inkacorp
            const uploadRes = await window.uploadImageToStorage(admImageFile, 'administrativos/gastos', id_gastos, 'inkacorp');

            if (uploadRes.success) {
                fotografia = uploadRes.url;
            } else {
                throw new Error('Error al subir comprobante: ' + uploadRes.error);
            }
        }

        // 2. Guardar en DB
        const supabase = window.getSupabaseClient();
        const dataToSave = {
            id_gastos,
            monto,
            motivo,
            fecha,
            fotografia,
            created_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('ic_gastos_administrativos')
            .upsert(dataToSave);

        if (error) throw error;

        await window.showAlert('El gasto administrativo se ha guardado correctamente.', '¡Guardado Exitoso!', 'success');
        document.getElementById('modal-gasto-adm').classList.add('hidden');
        await loadAdmData();

    } catch (err) {
        console.error('Error al guardar:', err);
        await window.showFinancialError?.(err, 'No se pudo guardar el gasto administrativo.')
            || window.showAlert(err.message, 'Error', 'error');
    } finally {
        btnSave.disabled = false;
        btnSave.innerHTML = originalText;
    }
}

/**
 * Muestra la evidencia en el modal viewer
 */
function viewAdmEvidencia(url) {
    const modal = document.getElementById('modal-evidencia-adm');
    const img = document.getElementById('evidencia-full-img');
    const downloadBtn = document.getElementById('btn-download-evidencia');

    img.src = url;
    downloadBtn.href = url;

    modal.classList.remove('hidden');
}

/**
 * Helper para formatear fechas
 * Corrige el desfase de zona horaria forzando el parsing local
 */
function formatAdmDate(dateStr) {
    if (!dateStr) return '';
    try {
        // Al usar "/" en lugar de "-" se interpreta como fecha local en la mayoría de navegadores
        // O podemos añadir la hora para evitar el desfase de UTC
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            const d = new Date(parts[0], parts[1] - 1, parts[2]);
            return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('es-EC', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return dateStr;
    }
}

// Exponer funciones globales para eventos onclick
window.viewAdmEvidencia = viewAdmEvidencia;
window.deleteAdmGasto = deleteAdmGasto;
window.initAdministrativosModule = initAdministrativosModule;
window.generateAdmReportPDF = generateAdmReportPDF;

/**
 * GENERACIÓN DE REPORTES PDF (ESTILO SITUACIÓN BANCARIA)
 */

async function generateAdmReportPDF() {
    try {
        const { value: formValues } = await Swal.fire({
            title: 'Reporte de Gastos Administrativos',
            background: '#1a1f26',
            color: '#ffffff',
            html: `
                <div class="swal-export-container">
                    <p id="export-mode-desc" class="export-desc">Seleccione el mes para el reporte consolidado.</p>
                    
                    <div class="export-mode-selector">
                        <button type="button" id="btn-mode-month" class="mode-btn active">POR MES</button>
                        <button type="button" id="btn-mode-range" class="mode-btn">RANGO FECHAS</button>
                    </div>

                    <div id="container-month" class="mode-container">
                        <label class="premium-label">Seleccionar Mes</label>
                        <input type="month" id="swal-month" class="premium-input-swal" value="${new Date().toISOString().substring(0, 7)}">
                    </div>

                    <div id="container-range" class="mode-container hidden">
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                            <div>
                                <label class="premium-label">Desde</label>
                                <input type="date" id="swal-start" class="premium-input-swal">
                            </div>
                            <div>
                                <label class="premium-label">Hasta</label>
                                <input type="date" id="swal-end" class="premium-input-swal">
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    .swal-export-container { text-align: left; padding: 10px 5px; }
                    .export-desc { font-size: 0.9rem; color: #94a3b8; margin-bottom: 25px; line-height: 1.5; border-left: 3px solid #10B981; padding-left: 15px; }
                    .export-mode-selector { display: flex; background: #0f172a; border-radius: 12px; padding: 5px; margin-bottom: 25px; border: 1px solid rgba(255, 255, 255, 0.05); }
                    .mode-btn { flex: 1; border: none; background: transparent; padding: 10px; font-size: 0.85rem; font-weight: 800; color: #64748B; cursor: pointer; border-radius: 10px; transition: all 0.3s ease; }
                    .mode-btn.active { background: #10B981; color: white; box-shadow: 0 4px 12px rgba(16, 185, 129, 0.2); }
                    .mode-btn:not(.active):hover { color: #ffffff; background: rgba(255,255,255,0.05); }
                    .mode-container { animation: fadeIn 0.3s ease; }
                    @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
                    .premium-label { display: block; font-size: 0.75rem; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.05em; }
                    .premium-input-swal { width: 100%; padding: 12px; border-radius: 10px; border: 1.5px solid #2f3946; background: #242c36; font-family: inherit; font-size: 0.95rem; color: #ffffff; outline: none; transition: all 0.2s; }
                    .premium-input-swal:focus { border-color: #10B981; box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1); background: #1a1f26; }
                    .hidden { display: none; }
                    .swal2-popup { border-radius: 1.5rem !important; border: 1px solid rgba(255,255,255,0.1) !important; }
                </style>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-file-pdf"></i> Generar PDF',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0E5936',
            cancelButtonColor: '#334155',
            focusConfirm: false,
            didOpen: () => {
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
            titlePeriod = `REPORTE DE GASTOS: ${monthNames[parseInt(month) - 1]} ${year}`;
        } else {
            startDate = formValues.start;
            endDate = formValues.end;
            titlePeriod = `DESDE ${startDate} HASTA ${endDate}`;
        }

        if (typeof window.showLoader === 'function') window.showLoader(`Generando reporte PDF...`);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const supabase = window.getSupabaseClient();

        // Fetch gastos for the period
        const { data: gastos, error: errorGastos } = await supabase
            .from('ic_gastos_administrativos')
            .select('*')
            .gte('fecha', startDate)
            .lte('fecha', endDate)
            .order('fecha', { ascending: true });

        if (errorGastos) throw errorGastos;
        if (!gastos || gastos.length === 0) throw new Error(`No hay gastos registrados entre ${startDate} y ${endDate} para generar el reporte.`);

        // Generate PDF content
        let yPos = 20;
        const pageHeight = 297;
        const marginBottom = 20;
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-EC');
        const timeStr = now.toLocaleTimeString('es-EC');

        // Logo
        try {
            doc.addImage(logoUrl, 'PNG', 15, 12, 18, 18);
        } catch (e) { console.warn('Logo no disponible'); }

        // Header
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50);
        doc.text("INKA CORP", 38, 18);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text("REPORTE DE GASTOS ADMINISTRATIVOS", 38, 24);

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generado: ${dateStr} | ${timeStr}`, 148, 18);
        doc.text(`Total registros: ${gastos.length}`, 148, 23);

        yPos = 34;
        doc.setFontSize(9);
        doc.setTextColor(11, 78, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(`PERIODO: ${titlePeriod}`, 15, yPos);

        yPos += 2;
        doc.setDrawColor(242, 187, 58);
        doc.setLineWidth(0.5);
        doc.line(15, yPos, 195, yPos);

        yPos += 10;

        let count = 0;
        const total = gastos.length;

        for (const gasto of gastos) {
            count++;
            if (typeof window.showLoader === 'function') window.showLoader(`Procesando gasto ${count} de ${total}...`);

            const boxHeight = 90;

            if (yPos + boxHeight > (pageHeight - marginBottom)) {
                doc.addPage();
                yPos = 20;
            }

            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.4);
            doc.roundedRect(15, yPos, 180, boxHeight, 3, 3);

            let textY = yPos + 10;
            const leftMargin = 20;
            const maxTextWidth = 80;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(11, 78, 50);

            doc.text(`MOTIVO:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            const motivoLines = doc.splitTextToSize(gasto.motivo || 'N/A', maxTextWidth);
            doc.text(motivoLines, leftMargin + 25, textY);
            textY += (motivoLines.length * 5) + 3;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(11, 78, 50);
            doc.text(`MONTO:`, leftMargin, textY);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(185, 28, 28); // Rojo
            doc.text(`$${parseFloat(gasto.monto || 0).toFixed(2)}`, leftMargin + 25, textY);
            textY += 8;

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(11, 78, 50);
            doc.text(`FECHA:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(30, 41, 59);
            doc.text(`${gasto.fecha}`, leftMargin + 25, textY);
            textY += 8;

            // Evidence Image
            if (gasto.fotografia) {
                try {
                    const imgData = await fetchImageAsBase64(gasto.fotografia);
                    if (imgData) {
                        doc.addImage(imgData, 'JPEG', 110, yPos + 5, 80, 80, undefined, 'FAST');
                    }
                } catch (imgErr) {
                    doc.setFontSize(8);
                    doc.setTextColor(150);
                    doc.text("[Error al cargar evidencia]", 130, yPos + 40);
                }
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text("[Sin Evidencias]", 130, yPos + 40);
            }

            yPos += boxHeight + 8;
        }

        doc.save(`Reporte_Gastos_Adm_${titlePeriod.replace(/ /g, '_')}.pdf`);
        if (typeof window.hideLoader === 'function') window.hideLoader();
        await window.showAlert('El reporte de gastos se ha generado correctamente.', 'Reporte Listo', 'success');

    } catch (error) {
        console.error('Error PDF:', error);
        if (typeof window.hideLoader === 'function') window.hideLoader();
        window.showAlert(error.message, 'Error', 'error');
    }
}

async function fetchImageAsBase64(url) {
    if (!url) return null;
    let cleanUrl = url.replace('/d/$', '/d/');
    const driveRegex = /file\/d\/([a-zA-Z0-9_-]+)|id=([a-zA-Z0-9_-]+)/;
    const match = cleanUrl.match(driveRegex);
    if (match) {
        const fileId = match[1] || match[2];
        if (fileId) cleanUrl = `https://lh3.googleusercontent.com/d/${fileId}=w1000`;
    }
    try {
        const response = await fetch(cleanUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (blob.type.includes('html')) return null;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        return null;
    }
}
