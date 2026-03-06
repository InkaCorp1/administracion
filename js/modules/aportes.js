/**
 * INKA CORP - Módulo de Aportes Semanales
 * Maneja el registro y gestión de aportes de socios
 */

// Estado del módulo
let aportesData = [];
let sociosAportes = [];
let selectedAporteFiles = [];
let filtroSemanaSeleccionada = null; // null significa "Vista Reciente / Todo"
let forcedTargetWeek = null; // Para bloquear la semana al completar aportes con fecha actual

// Configuración de fechas para cálculo de semanas
const ANCHOR_DATE = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov

/**
 * Calcula el número de semana para una fecha dada
 */
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    monday.setHours(12, 0, 0, 0);
    return Math.floor((monday.getTime() - ANCHOR_DATE.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

/**
 * Obtiene el número de semana actual
 */
function getCurrentWeekNumber() {
    return getWeekNumber(new Date());
}

// Función para alternar visibilidad de detalles de aportes agrupados
window.toggleDetalleAportes = function(id) {
    const el = document.getElementById('detalle_' + id);
    if (!el) return;
    
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        // Transición suave
        setTimeout(() => {
            el.style.opacity = '1';
        }, 10);
    } else {
        el.style.opacity = '0';
        setTimeout(() => {
            el.classList.add('hidden');
        }, 300);
    }
};

/**
 * Inicializa el módulo de Aportes Semanales
 */
async function initAportesModule() {
    // Resetear filtro de semana al iniciar el módulo
    filtroSemanaSeleccionada = null;

    // Configurar event listeners
    setupAportesEventListeners();

    // Cargar datos iniciales
    await cargarDatosAportes();

    // Llenar selects de socios
    await llenarSelectsSocios();
}

/**
 * Configura los event listeners del módulo
 */
function setupAportesEventListeners() {
    // Botón Nuevo Aporte
    const btnNuevo = document.getElementById('btn-nuevo-aporte');
    if (btnNuevo) {
        btnNuevo.addEventListener('click', () => {
            closeAllModals();
            resetFormAporte();
            const modal = document.getElementById('modal-aporte');
            modal.style.display = 'flex';
            modal.classList.remove('hidden');

            // Llenar el selector de semanas manual
            llenarSelectorSemanasManual();

            // Set fecha actual por defecto
            document.getElementById('aporte-fecha').value = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
        });
    }

    // Botón Historial Completo
    const btnHistorial = document.getElementById('btn-ver-historial-completo');
    if (btnHistorial) {
        btnHistorial.addEventListener('click', async () => {
            closeAllModals();
            const modal = document.getElementById('modal-historial-aportes');
            modal.style.display = 'flex';
            modal.classList.remove('hidden');
            await cargarHistorialCompleto();
        });
    }

    // Botón Pendientes
    const btnPendientes = document.getElementById('btn-ver-pendientes');
    if (btnPendientes) {
        btnPendientes.addEventListener('click', verAportesPendientes);
    }

    // Cerrar modales
    const closeElements = document.querySelectorAll('[data-close-modal]');
    closeElements.forEach(el => {
        el.addEventListener('click', closeAllModals);
    });

    // Manejo de carga de imagen
    const uploadPlaceholder = document.getElementById('aporte-upload-placeholder');
    const fileInput = document.getElementById('aporte-comprobante');
    const multiCheck = document.getElementById('aporte-multi-comprobante');

    if (uploadPlaceholder && fileInput) {
        uploadPlaceholder.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleAporteFileSelect(Array.from(e.target.files));
            }
        });
    }

    if (multiCheck && fileInput) {
        multiCheck.addEventListener('change', () => {
            fileInput.multiple = multiCheck.checked;
            // No reseteamos automáticamente para permitir que el usuario 
            // cambie de opinión antes de subir, pero informamos si ya hay algo
            if (selectedAporteFiles.length > 0) {
                resetAporteImage();
            }
        });
    }

    const btnRemovePreview = document.querySelector('.btn-remove-preview');
    if (btnRemovePreview) {
        btnRemovePreview.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAporteImage();
        });
    }

    // Listener para cambio de fecha o socio para actualizar estado de semana
    const inputFecha = document.getElementById('aporte-fecha');
    const selectWeekOverride = document.getElementById('aporte-week-override');
    const checkIgualacion = document.getElementById('aporte-igualacion');
    if (inputFecha) inputFecha.addEventListener('change', updateStatusSemana);
    if (selectWeekOverride) selectWeekOverride.addEventListener('change', () => {
        const val = selectWeekOverride.value;
        forcedTargetWeek = val ? parseInt(val) : null;
        updateStatusSemana();
    });
    if (checkIgualacion) checkIgualacion.addEventListener('change', updateStatusSemana);

    // Formulario de Registro
    const formAporte = document.getElementById('form-aporte');
    if (formAporte) {
        formAporte.addEventListener('submit', handleAporteSubmit);
    }

    // Search input for aporte modal (filtro en tiempo real)
    const aporteSearch = document.getElementById('aporte-socio-search');
    const aporteHidden = document.getElementById('aporte-socio');
    const aporteDatalist = document.getElementById('aporte-socio-list');
    const aporteSelectedView = document.getElementById('aporte-socio-selected');

    if (aporteSearch) {
        const suggestionsEl = document.getElementById('aporte-socio-suggestions');
        let focusedIndex = -1;

        // Render suggestions under the input using filterAporteSocios
        async function renderSuggestions(q) {
            const matches = await filterAporteSocios(q) || [];
            if (!suggestionsEl) return matches;

            if (!matches || matches.length === 0) {
                suggestionsEl.innerHTML = '';
                suggestionsEl.classList.add('hidden');
                focusedIndex = -1;
                return matches;
            }

            suggestionsEl.innerHTML = matches.map((m, idx) =>
                `<div role="option" aria-selected="false" class="aporte-suggestion" data-idx="${idx}" data-id="${m.idsocio}">
                    <div class="suggestion-name">${(m.nombre || '').replace(/</g,'&lt;')}</div>
                </div>`
            ).join('');

            suggestionsEl.classList.remove('hidden');
            focusedIndex = -1;

            // attach click handlers
            Array.from(suggestionsEl.children).forEach(node => {
                node.addEventListener('click', (ev) => {
                    const id = node.getAttribute('data-id');
                    selectAporteById(id);
                    hideSuggestions();
                });
            });

            return matches;
        }

        function showSuggestions() { if (suggestionsEl) suggestionsEl.classList.remove('hidden'); }
        function hideSuggestions() { if (suggestionsEl) suggestionsEl.classList.add('hidden'); focusedIndex = -1; }

        function highlight(index) {
            if (!suggestionsEl) return;
            const items = suggestionsEl.querySelectorAll('.aporte-suggestion');
            items.forEach((it, i) => {
                const sel = i === index;
                it.setAttribute('aria-selected', sel ? 'true' : 'false');
                it.classList.toggle('is-active', sel);
                if (sel) it.scrollIntoView({ block: 'nearest' });
            });
            focusedIndex = index;
        }

        aporteSearch.addEventListener('input', async (e) => {
            clearSelectedAporte(false);
            await renderSuggestions(e.target.value);
        });

        aporteSearch.addEventListener('keydown', (e) => {
            const items = suggestionsEl ? suggestionsEl.querySelectorAll('.aporte-suggestion') : [];
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (items.length === 0) return;
                const next = Math.min(focusedIndex + 1, items.length - 1);
                highlight(next);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (items.length === 0) return;
                const prev = Math.max(focusedIndex - 1, 0);
                highlight(prev);
            } else if (e.key === 'Enter') {
                if (focusedIndex >= 0 && suggestionsEl) {
                    const node = suggestionsEl.querySelector(`.aporte-suggestion[data-idx="${focusedIndex}"]`);
                    if (node) {
                        selectAporteById(node.getAttribute('data-id'));
                        hideSuggestions();
                        e.preventDefault();
                    }
                } else {
                    // if exact single match, select it
                    const matches = (sociosAportes || []).filter(s => (s.nombre || '').toLowerCase() === (aporteSearch.value || '').trim().toLowerCase() || String(s.idsocio) === (aporteSearch.value || '').trim());
                    if (matches.length === 1) {
                        selectAporteById(matches[0].idsocio);
                        hideSuggestions();
                        e.preventDefault();
                    }
                }
            } else if (e.key === 'Escape') {
                hideSuggestions();
                clearSelectedAporte(true);
            }
        });

        aporteSearch.addEventListener('focus', (e) => {
            if ((aporteSearch.value || '').trim().length > 0) renderSuggestions(aporteSearch.value);
        });

        // click outside hides suggestions
        document.addEventListener('click', (ev) => {
            if (!document.getElementById('modal-aporte')) return;
            const within = ev.target.closest && ev.target.closest('#modal-aporte');
            if (!within) return;
            const insideInput = ev.target.closest && ev.target.closest('#aporte-socio-search');
            const insideSug = ev.target.closest && ev.target.closest('#aporte-socio-suggestions');
            if (!insideInput && !insideSug) hideSuggestions();
        });

        function hideSuggestionsOnBlur() { setTimeout(() => hideSuggestions(), 120); }
        aporteSearch.addEventListener('blur', hideSuggestionsOnBlur);
    }

    // Filtros de Historial
    const btnFilter = document.getElementById('btn-filter-aportes');
    if (btnFilter) {
        btnFilter.addEventListener('click', cargarHistorialCompleto);
    }

    // Botón Reporte General PDF
    const btnReportePDF = document.getElementById('btn-reporte-general-aportes');
    if (btnReportePDF) {
        btnReportePDF.addEventListener('click', generateAportesReport);
    }
}

/**
 * Cierra todos los modales del módulo
 */
function closeAllModals() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(m => {
        m.style.display = 'none';
        m.classList.add('hidden');
    });
}

/**
 * Maneja la selección de archivo de comprobante
 */
function handleAporteFileSelect(files) {
    const isMulti = document.getElementById('aporte-multi-comprobante')?.checked;
    
    // Validar tipos
    const validFiles = files.filter(f => f.type.startsWith('image/'));
    if (validFiles.length < files.length) {
        showAlert('Algunos archivos no son imágenes válidas y fueron ignorados', 'Aviso', 'warning');
    }

    if (!isMulti) {
        selectedAporteFiles = [validFiles[0]];
    } else {
        // En modo multi, acumulamos sin duplicados de nombre
        const existingNames = selectedAporteFiles.map(f => f.name);
        const newFiles = validFiles.filter(f => !existingNames.includes(f.name));
        selectedAporteFiles = [...selectedAporteFiles, ...newFiles];
    }

    renderAportePreviews();
}

/**
 * Renderiza las miniaturas de los archivos seleccionados
 */
function renderAportePreviews() {
    const previewContainer = document.getElementById('aporte-preview');
    const placeholder = document.getElementById('aporte-upload-placeholder');
    
    if (selectedAporteFiles.length === 0) {
        previewContainer.classList.add('hidden');
        previewContainer.innerHTML = '';
        placeholder.classList.remove('hidden');
        return;
    }

    placeholder.classList.add('hidden');
    previewContainer.classList.remove('hidden');
    previewContainer.innerHTML = '';

    selectedAporteFiles.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const div = document.createElement('div');
            div.className = 'preview-item-wrapper';
            div.style.position = 'relative';
            div.style.width = '80px';
            div.style.height = '80px';
            div.style.borderRadius = '8px';
            div.style.overflow = 'hidden';
            div.style.border = '1px solid var(--gold)';

            div.innerHTML = `
                <img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">
                <button type="button" class="btn-remove-preview" data-index="${index}" style="position:absolute; top:2px; right:2px; width:20px; height:20px; font-size:10px; padding:0; display:flex; align-items:center; justify-content:center;">
                    <i class="fas fa-times"></i>
                </button>
            `;
            
            div.querySelector('.btn-remove-preview').onclick = (ev) => {
                ev.stopPropagation();
                selectedAporteFiles.splice(index, 1);
                renderAportePreviews();
            };

            previewContainer.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

/**
 * Resetea la imagen del formulario
 */
function resetAporteImage() {
    selectedAporteFiles = [];
    document.getElementById('aporte-comprobante').value = '';
    document.getElementById('aporte-upload-placeholder').classList.remove('hidden');
    document.getElementById('aporte-preview').classList.add('hidden');
    document.getElementById('aporte-preview').innerHTML = '';
}

/**
 * Carga los datos iniciales de aportes
 */
async function cargarDatosAportes() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        // Intentar cargar aportes (limitado a los últimos de la semana para el dashboard)
        // Usamos una tabla hipotética ic_aportes_semanales
        const { data, error } = await supabase
            .from('ic_aportes_semanales')
            .select('*, socio:ic_socios!id_socio(nombre)')
            .order('fecha', { ascending: false });

        if (error) {
            console.warn('Error cargando aportes (posible tabla inexistente):', error.message);
            // Si la tabla no existe, mostramos mensaje vacío
            renderAportesRecientes([]);
            return;
        }

        aportesData = data;
        renderAportesRecientes(data);

    } catch (error) {
        console.error('Error en cargarDatosAportes:', error);
    }
}

/**
 * Renderiza la tabla de aportes recientes (mini-historial)
 * Mostramos el último aporte de cada persona en la semana actual
 */
function renderAportesRecientes(data) {
    const listContainer = document.getElementById('lista-aportes-recientes');
    if (!listContainer) return;

    // Obtener semana actual
    const currentWeekNum = getCurrentWeekNumber();

    // Determinar qué semana estamos auditando para las estadísticas
    const targetWeek = filtroSemanaSeleccionada || currentWeekNum;
    
    // Calcular estadísticas basadas SIEMPRE en la semana (actual o seleccionada)
    const aportesDeLaSemana = data.filter(a => {
        // Priorizar semana forzada
        if (a.sub_semana && !isNaN(a.sub_semana)) {
            return parseInt(a.sub_semana) === targetWeek;
        }
        // Fallback a fecha
        return getWeekNumber(a.fecha + 'T12:00:00') === targetWeek;
    });

    const sociosUnicos = new Set(aportesDeLaSemana.map(a => a.id_socio));
    const totalCajaSemana = aportesDeLaSemana.reduce((sum, a) => sum + parseFloat(a.monto || 0), 0);

    // Actualizar estadísticas del dashboard
    updateAportesStats(sociosUnicos, totalCajaSemana, aportesDeLaSemana.length);

    // Determinar qué mostrar en la TABLA (la vista de "Movimientos Recientes")
    const aportesAMostrar = filtroSemanaSeleccionada 
        ? aportesDeLaSemana // Si hay filtro, mostramos solo lo filtrado
        : data.slice(0, 10); // Vista por defecto: últimos 10 movimientos globales

    // Actualizar Label de Semana en el Dashboard
    const weekLabel = document.getElementById('current-week-label');
    if (weekLabel) {
        const targetW = filtroSemanaSeleccionada || currentWeekNum;
        const mon = new Date(ANCHOR_DATE);
        mon.setDate(ANCHOR_DATE.getDate() + (targetW - 1) * 7);
        const sat = new Date(mon);
        sat.setDate(mon.getDate() + 5);
        const satLabel = sat.toLocaleDateString('es-EC', {day:'numeric', month:'short'});
        
        if (filtroSemanaSeleccionada) {
            weekLabel.innerHTML = `Semana ${filtroSemanaSeleccionada} (SÁB ${satLabel}) <i class="fas fa-chevron-down" style="font-size: 0.7rem; margin-left: 5px;"></i>`;
        } else {
            weekLabel.innerHTML = `Semana ${currentWeekNum} (SÁB ${satLabel}) <i class="fas fa-chevron-down" style="font-size: 0.7rem; margin-left: 5px;"></i>`;
        }
        weekLabel.style.cursor = 'pointer';
        weekLabel.onclick = () => abrirSelectorSemanas(currentWeekNum);
    }

    if (!aportesAMostrar || aportesAMostrar.length === 0) {
        const msg = filtroSemanaSeleccionada 
            ? `No hay aportes registrados para la Semana ${filtroSemanaSeleccionada}`
            : 'No hay aportes registrados recientemente';
        listContainer.innerHTML = `<tr><td colspan="5" class="text-center py-5">${msg}</td></tr>`;
        return;
    }

    // Renderizar filas de la tabla
    let html = '';
    let pendingHTML = '';

    // Mostrar socios pendientes (los 3 socios principales) para la semana que se está auditando
    const sociosObjetivo = sociosAportes.filter(s => ['69c69e99', 'be3ff55b', '20b691de'].includes(s.idsocio));
    
    sociosObjetivo.forEach(socio => {
        // Verificar si este socio tiene aporte en la semana auditada (targetWeek)
        const tieneAporte = aportesDeLaSemana.some(a => a.id_socio === socio.idsocio);
        if (!tieneAporte) {
            const initial = (socio.nombre || 'S').charAt(0);
            const monDate = new Date(ANCHOR_DATE);
            monDate.setDate(ANCHOR_DATE.getDate() + (targetWeek - 1) * 7);
            const fechaSug = monDate.toISOString().split('T')[0];

            pendingHTML += `
                <tr class="fade-in" style="background: rgba(239, 68, 68, 0.03);">
                    <td>
                        <div class="d-flex align-items-center" style="opacity: 0.7;">
                            <div class="avatar-initial" style="background: #334155;">${initial}</div>
                            <div>
                                <div class="font-weight-bold text-white">${socio.nombre}</div>
                                <small class="text-danger" style="font-size: 0.65rem; font-weight: 800;">SIN REGISTRO (SEM ${targetWeek})</small>
                            </div>
                        </div>
                    </td>
                    <td><span class="text-muted" style="font-size: 1.1rem; opacity: 0.5;">$0,00</span></td>
                    <td><span class="text-muted" style="font-size: 0.85rem;">${targetWeek === currentWeekNum ? 'PENDIENTE HOY' : 'PENDIENTE'}</span></td>
                    <td><span class="badge badge-danger px-3 py-2 rounded-pill shadow-sm" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444;"><i class="fas fa-times mr-1"></i> No Registrado</span></td>
                    <td class="text-center">
                        <button class="btn-icon shadow-sm" style="background: #0E5936; border: none; width: 110px; height: 35px; border-radius: 6px; color: white; display: flex; align-items: center; justify-content: center; gap: 8px;" onclick="window.igualarAportePendiente('${socio.idsocio}', '${socio.nombre}', '${fechaSug}', '${targetWeek}')">
                            <i class="fas fa-plus-circle"></i> Aportar
                        </button>
                    </td>
                </tr>
            `;
        }
    });

    // Procesar aportes a mostrar en la tabla (ya sea filtrados o los últimos 10)
    aportesAMostrar.forEach(aporte => {
        const initial = (aporte.socio?.nombre || 'S').charAt(0);
        html += `
            <tr class="fade-in">
                <td>
                    <div class="d-flex align-items-center">
                        <div class="avatar-initial">${initial}</div>
                        <div>
                            <div class="font-weight-bold text-white">${aporte.socio?.nombre || 'Desconocido'}</div>
                            <small class="text-muted" style="font-size: 0.7rem;">ID: ${aporte.id_socio}</small>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="font-weight-bold" style="color: #F2BB3A; font-size: 1.1rem;">
                        $${parseFloat(aporte.monto).toLocaleString('es-EC', { minimumFractionDigits: 2 })}
                    </div>
                </td>
                <td>
                    <div class="d-flex flex-column">
                        <span>${formatDate(aporte.fecha)}</span>
                        <small class="text-muted"><i class="far fa-clock"></i> ${formatDateTime(aporte.created_at).split(' ')[1] || ''}</small>
                    </div>
                </td>
                <td><span class="badge badge-success px-3 py-2 rounded-pill shadow-sm"><i class="fas fa-check mr-1"></i> Recibido</span></td>
                <td class="text-center">
                    <div class="d-flex flex-row align-items-center justify-content-center" style="gap: 8px; flex-wrap: wrap;">
                        ${(aporte.comprobante_url || '').split('|').map((u, i, arr) => {
                            if (!u.trim()) return '';
                            const label = arr.length > 1 ? ` <span style="font-size: 0.65rem; margin-left: 2px;">${i+1}</span>` : '';
                            return `
                                <button class="btn-icon shadow-sm" style="background: var(--gray-800); border: 1px solid var(--border-color); width: 35px; height: 35px;" onclick="verComprobanteAporte('${u.trim()}')" title="Ver Comprobante ${i+1}">
                                    <i class="fas fa-image text-gold"></i>${label}
                                </button>
                            `;
                        }).join('')}
                        <button class="btn-icon shadow-sm" style="background: var(--gray-800); border: 1px solid var(--border-color); width: 35px; height: 35px;" onclick="gestionarSemana('${aporte.id_aporte}', '${aporte.fecha}', '${aporte.sub_semana || ''}', '${aporte.id_socio}', '${aporte.socio?.nombre || ''}')" title="Gestionar / Reemplazar Comprobante">
                            <i class="fas fa-pencil-alt text-gold"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    listContainer.innerHTML = pendingHTML + html;
}

/**
 * Actualiza los contadores del panel de estadísticas
 */
function updateAportesStats(sociosSet, totalMonto, countSemana) {
    const elSocios = document.getElementById('stat-socios-count');
    const elTotal = document.getElementById('stat-total-caja');
    const elWeek = document.getElementById('stat-week-count');

    if (elSocios) elSocios.textContent = sociosSet.size || sociosSet.length || 0;
    if (elTotal) elTotal.textContent = `$${totalMonto.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
    if (elWeek) elWeek.textContent = countSemana || 0;
}
/**
 * Llena los selects de socios
 */
async function llenarSelectsSocios() {
    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        // Cargar socios del caché o DB
        let socios = [];
        if (window.hasCacheData && window.hasCacheData('socios')) {
            socios = window.getCacheData('socios');
        } else {
            const { data } = await supabase.from('ic_socios').select('idsocio, nombre').order('nombre');
            socios = data || [];
        }

        sociosAportes = socios;

        const selectAporte = document.getElementById('aporte-socio');
        const selectFilter = document.getElementById('filter-aporte-socio');

        if (selectAporte) {
            // selectAporte fue eliminado del DOM — mantener compatibilidad: escribir el primer match en el hidden si existe
            if (socios.length === 1) {
                selectAporte.value = socios[0].idsocio;
            }
        }

        if (selectFilter) {
            selectFilter.innerHTML = '<option value="">Todos los socios</option>' +
                socios.map(s => `<option value="${s.idsocio}">${s.nombre}</option>`).join('');
        }

        // Reset visual/search state
        const aporteSearch = document.getElementById('aporte-socio-search');
        if (aporteSearch) aporteSearch.value = '';
        if (typeof filterAporteSocios === 'function') filterAporteSocios('');

    } catch (error) {
        console.error('Error al llenar selects de socios:', error);
    }
}

/**
 * Filtra el select `#aporte-socio` usando el array `sociosAportes` (sin volver a pedir al servidor)
 * @param {string} query
 */
function escapeHtml(str){ return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

async function filterAporteSocios(query) {
    const q = String(query || '').trim().toLowerCase();

    // Si aún no tenemos socios cargados, cargarlos (fallback silencioso)
    if (!Array.isArray(sociosAportes) || sociosAportes.length === 0) {
        try {
            await llenarSelectsSocios();
        } catch (err) {
            console.warn('filterAporteSocios: no se pudieron cargar socios a tiempo', err);
        }
    }

    const matches = q === ''
        ? sociosAportes
        : sociosAportes.filter(s => (s.nombre || '').toLowerCase().includes(q) || String(s.idsocio).includes(q));

    // Poblar datalist con coincidencias (para que el navegador muestre sugerencias)
    const aporteDatalist = document.getElementById('aporte-socio-list');
    if (aporteDatalist) {
        if (!matches || matches.length === 0) {
            aporteDatalist.innerHTML = `<option value="No se encontraron socios"></option>`;
        } else {
            aporteDatalist.innerHTML = matches.map(s => `<option value="${escapeHtml(s.nombre)}"></option>`).join('');
        }
    }

    return matches;
}

/**
 * Setea la selección actual del socio: actualiza el hidden, muestra la 'pill' y limpia el input
 */
function selectAporteById(id) {
    const found = sociosAportes.find(s => String(s.idsocio) === String(id));
    const aporteHidden = document.getElementById('aporte-socio');
    const aporteSearch = document.getElementById('aporte-socio-search');
    const aporteSelectedView = document.getElementById('aporte-socio-selected');
    if (!found || !aporteHidden || !aporteSearch || !aporteSelectedView) return;

    aporteHidden.value = found.idsocio;
    aporteSelectedView.classList.remove('hidden');
    aporteSelectedView.innerHTML = `
        <div class="selected-socio-pill">
            <i class="fas fa-user-circle mr-2"></i>
            <span class="selected-socio-name">${escapeHtml(found.nombre)}</span>
            <button type="button" class="btn-clear-selected" aria-label="Quitar socio">&times;</button>
        </div>
    `;
    aporteSearch.value = '';

    // Actualizar estado de semana
    updateStatusSemana();

    // Clear handler for the pill
    const btn = aporteSelectedView.querySelector('.btn-clear-selected');
    if (btn) btn.addEventListener('click', () => clearSelectedAporte(true));
}

function clearSelectedAporte(focusInput = false) {
    const aporteHidden = document.getElementById('aporte-socio');
    const aporteSearch = document.getElementById('aporte-socio-search');
    const aporteSelectedView = document.getElementById('aporte-socio-selected');
    if (aporteHidden) aporteHidden.value = '';
    if (aporteSelectedView) { aporteSelectedView.classList.add('hidden'); aporteSelectedView.innerHTML = ''; }
    
    // Ocultar status
    const statusBanner = document.getElementById('aporte-status-semana');
    if (statusBanner) statusBanner.classList.add('hidden');

    if (focusInput && aporteSearch) aporteSearch.focus();
}

/**
 * Actualiza la información visual de cuánto ha aportado el socio en la semana seleccionada
 */
async function updateStatusSemana() {
    const socioId = document.getElementById('aporte-socio')?.value;
    const fecha = document.getElementById('aporte-fecha')?.value;
    const statusBanner = document.getElementById('aporte-status-semana');

    if (!socioId || !fecha || !statusBanner) {
        if (statusBanner) statusBanner.classList.add('hidden');
        return;
    }

    try {
        const anchor = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov
        const d = new Date(fecha + 'T12:00:00');
        const day = d.getDay();
        const diff = d.getDate() - (day === 0 ? 6 : day - 1);
        const monday = new Date(d);
        monday.setDate(diff);
        monday.setHours(12, 0, 0, 0);

        const diffMs = monday.getTime() - anchor.getTime();
        const calcWeekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

        // Lógica de Semana:
        // 1. Si forcedTargetWeek existe (viniendo desde el historial/lápiz), se respeta SIEMPRE esa semana
        // sin importar la fecha que se ponga en el calendario.
        // 2. Si no hay forcedTargetWeek, se calcula dinámicamente según la fecha.
        const weekNum = forcedTargetWeek || calcWeekNum;

        // Determinar monto objetivo (450 desde semana 10, de lo contrario asumimos el estándar previo si existe, o 300)
        const montoObjetivo = weekNum >= 10 ? 450.00 : 300.00;

        // Buscar aportes existentes para este socio en este rango de semana o que tengan el override de semana
        const mondayTarget = new Date(anchor);
        mondayTarget.setDate(anchor.getDate() + (weekNum - 1) * 7);
        const sundayTarget = new Date(mondayTarget);
        sundayTarget.setDate(mondayTarget.getDate() + 6);
        sundayTarget.setHours(23, 59, 59, 999);

        // Formatear fechas para la query sin problemas de zona horaria
        const formatDateForQuery = (dt) => {
            const year = dt.getFullYear();
            const month = String(dt.getMonth() + 1).padStart(2, '0');
            const dayNum = String(dt.getDate()).padStart(2, '0');
            return `${year}-${month}-${dayNum}`;
        };

        const mondayStr = formatDateForQuery(mondayTarget);
        const sundayStr = formatDateForQuery(sundayTarget);

        const supabase = window.getSupabaseClient();
        
        // Filtro robusto para obtener los aportes de la semana objetivo (weekNum):
        // 1. Coincidir por override explícito (sub_semana == weekNum)
        // 2. O por rango de fecha, siempre que NO tenga un override a otra semana (sub_semana es NULL)
        const { data: aportesExistentes, error } = await supabase
            .from('ic_aportes_semanales')
            .select('monto, comprobante_url, fecha, sub_semana')
            .eq('id_socio', socioId)
            .or(`sub_semana.eq.${weekNum},and(sub_semana.is.null,fecha.gte.${mondayStr},fecha.lte.${sundayStr})`);

        if (error) throw error;

        const totalPagado = (aportesExistentes || []).reduce((sum, a) => sum + parseFloat(a.monto), 0);
        const pendiente = Math.max(0, montoObjetivo - totalPagado);

        // Actualizar UI
        statusBanner.classList.remove('hidden');
        document.getElementById('label-semana-num').textContent = weekNum;
        document.getElementById('status-monto-pagado').textContent = `$${totalPagado.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
        document.getElementById('status-monto-objetivo').textContent = `$${montoObjetivo.toLocaleString('es-EC', { minimumFractionDigits: 2 })}`;
        
        // Si el total pagado es >= objetivo, mostrar en verde
        const pagadoEl = document.getElementById('status-monto-pagado');
        if (totalPagado >= montoObjetivo) {
            pagadoEl.style.color = '#10B981';
        } else {
            pagadoEl.style.color = 'var(--gold)';
        }

        // Mostrar mini-comprobantes
        const comprobantesContainer = document.getElementById('status-comprobantes-previos');
        if (comprobantesContainer) {
            if (aportesExistentes && aportesExistentes.length > 0) {
                comprobantesContainer.innerHTML = '<p style="width: 100%; font-size: 0.75rem; color: #94a3b8; margin: 0 0 5px 0;">Comprobantes en esta semana:</p>' + 
                    aportesExistentes.map(a => {
                        const urls = (a.comprobante_url || '').split('|');
                        return urls.map((u, i) => {
                            if (!u.trim()) return '';
                            const badge = urls.length > 1 ? `<div class="index-mini">${i+1}</div>` : '';
                            return `
                                <div class="mini-comprobante" onclick="verComprobanteAporte('${u.trim()}')" title="Ver comprobante de $${a.monto} (#${i+1})">
                                    <img src="${u.trim()}" alt="Comp">
                                    ${badge}
                                    <div class="monto-mini">$${parseFloat(a.monto).toFixed(0)}</div>
                                </div>
                            `;
                        }).join('');
                    }).join('');
                comprobantesContainer.style.display = 'flex';
            } else {
                comprobantesContainer.innerHTML = '';
                comprobantesContainer.style.display = 'none';
            }
        }

        // Sugerir el monto pendiente en el input si es > 0 y el input está vacío
        const inputMonto = document.getElementById('aporte-monto');
        if (pendiente > 0 && (!inputMonto.value || inputMonto.value == 0)) {
            inputMonto.value = pendiente.toFixed(2);
        }

    } catch (err) {
        console.error('Error al actualizar estado de semana:', err);
    }
}


/**
 * Intenta abrir el dropdown nativo de un <select> de forma no destructiva.
 * Prueba varios métodos (keydown ArrowDown, mousedown/click) y atrapa errores.
 */
function openSelectDropdown(select) {
    if (!select) return;

    // 1) Focus + ArrowDown (funciona en Chrome/Edge/Firefox en escritorio)
    try {
        select.focus();
        const kd = new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true, cancelable: true });
        select.dispatchEvent(kd);
    } catch (e) {
        /* noop */
    }

    // 2) Simular mousedown/click (algunos navegadores abren el dropdown con mousedown)
    try {
        const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
        select.dispatchEvent(md);
        const mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
        select.dispatchEvent(mu);
        const ck = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        select.dispatchEvent(ck);
    } catch (e) {
        /* noop */
    }

    // 3) Fallback para móviles: temporariamente mostrar el select como lista (no persistente)
    try {
        if ('ontouchstart' in window && !select.hasAttribute('data-size-temp')) {
            const size = Math.min(8, Math.max(3, select.options.length));
            select.setAttribute('data-size-temp', String(size));
            select.setAttribute('size', String(size));
            // Restaurar después de 2s para no romper el layout permanentemente
            setTimeout(() => {
                select.removeAttribute('size');
                select.removeAttribute('data-size-temp');
            }, 2000);
        }
    } catch (e) {
        /* noop */
    }
}

/**
 * Maneja el envío del formulario de registro
 */
async function handleAporteSubmit(e) {
    e.preventDefault();

    // resolver socioId desde el hidden; si está vacío, intentar resolver por texto escrito
    let socioId = (document.getElementById('aporte-socio') || {}).value || '';
    const monto = document.getElementById('aporte-monto').value;
    const fecha = document.getElementById('aporte-fecha').value;

    if (!socioId) {
        const q = (document.getElementById('aporte-socio-search') || {}).value || '';
        const matches = sociosAportes.filter(s => (s.nombre || '').toLowerCase() === q.trim().toLowerCase() || String(s.idsocio) === q.trim());
        if (matches.length === 1) socioId = matches[0].idsocio;
    }

    if (!socioId || !monto || !fecha) {
        showAlert('Por favor complete todos los campos obligatorios', 'Atención', 'warning');
        return;
    }

    if (selectedAporteFiles.length === 0) {
        showAlert('Debe subir al menos una imagen del comprobante', 'Atención', 'warning');
        return;
    }

    try {
        beginLoading('Guardando aporte...');
        const supabase = window.getSupabaseClient();
        const currentUser = window.getCurrentUser ? window.getCurrentUser() : null;

        // 1. Subir imágenes usando la utilidad centralizada
        let urls = [];
        for (const file of selectedAporteFiles) {
            const uploadRes = await window.uploadFileToStorage(file, 'aportes', socioId);
            if (!uploadRes.success) {
                throw new Error('Error al subir un comprobante: ' + uploadRes.error);
            }
            urls.push(uploadRes.url);
        }

        const imageUrl = urls.join('|'); // Guardar múltiples URLs separadas por pipe

        // 2. Guardar en DB
        const { data, error } = await supabase
            .from('ic_aportes_semanales')
            .insert({
                id_socio: socioId,
                monto: parseFloat(monto),
                fecha: fecha,
                sub_semana: forcedTargetWeek ? String(forcedTargetWeek) : null,
                es_igualacion: document.getElementById('aporte-igualacion')?.checked || false,
                comprobante_url: imageUrl,
                id_usuario_registro: currentUser ? currentUser.id : null
            });

        if (error) throw error;

        // mostrar confirmación visible en el botón de guardar (breve)
        try {
            const _saveBtn = document.getElementById('btn-save-aporte');
            await flashSaveButtonState(_saveBtn, 'success', 900);
        } catch (e) { /* noop - no bloquear si falla */ }

        // cerrar el modal primero para evitar que overlays (backdrop) oculten el toast,
        // esperar un reflow corto y luego mostrar el toast (asegura visibilidad)
        try { closeAllModals(); } catch (e) { /* noop */ }
        await new Promise(res => setTimeout(res, 90));

        // mostrar el toast DESPUÉS de cerrar el modal para que sea visible inmediatamente
        try { showToast('Aporte registrado exitosamente', 'success'); } catch (e) { /* noop */ }

        // limpiar la selección del socio para que el modal abra vacío la próxima vez
        try { clearSelectedAporte(); } catch (e) { /* noop - protección defensiva */ }
        resetFormAporte();

        // Recargar datos
        await cargarDatosAportes();

    } catch (error) {
        console.error('Error al guardar aporte:', error);
        showAlert('No se pudo guardar el aporte: ' + error.message, 'Error', 'error');
        // indicar error en el botón de guardar (visible en el modal)
        try {
            const _saveBtn = document.getElementById('btn-save-aporte');
            await flashSaveButtonState(_saveBtn, 'error', 1400);
        } catch (e) { /* noop */ }
    } finally {
        endLoading();
    }
}

/**
 * Resetea el formulario de aporte
 */
function resetFormAporte() {
    const form = document.getElementById('form-aporte');
    if (form) form.reset();
    resetAporteImage();
    forcedTargetWeek = null; // Resetear la semana bloqueada
    
    // Al resetear, ocultar el banner
    const statusBanner = document.getElementById('aporte-status-semana');
    if (statusBanner) statusBanner.classList.add('hidden');
}

/**
 * Muestra un estado breve y visual en el botón de guardar ("success" | "error").
 * No altera la lógica de guardado; es puramente visual y tolerante a errores.
 * Devuelve una Promise que se resuelve cuando la animación termina.
 */
function flashSaveButtonState(btn, state = 'success', duration = 900) {
    if (!btn) return Promise.resolve();
    try {
        const original = {
            innerHTML: btn.innerHTML,
            disabled: btn.disabled,
            style: btn.getAttribute('style') || ''
        };

        // Estado visual temporal
        btn.disabled = true;
        btn.style.transition = 'transform 120ms ease, opacity 120ms ease, background-color 200ms ease';
        btn.style.transform = 'translateY(-1px) scale(1.02)';

        if (state === 'success') {
            btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:.5rem;"><i class="fas fa-check-circle"></i> Guardado</span>';
            btn.style.backgroundColor = '#1e6f3a';
            btn.style.color = '#ffffff';
        } else {
            btn.innerHTML = '<span style="display:inline-flex;align-items:center;gap:.5rem;"><i class="fas fa-exclamation-circle"></i> Error</span>';
            btn.style.backgroundColor = '#b22222';
            btn.style.color = '#ffffff';
        }

        return new Promise(res => {
            setTimeout(() => {
                // restaurar estado original
                btn.innerHTML = original.innerHTML;
                btn.disabled = original.disabled;
                if (original.style) btn.setAttribute('style', original.style); else btn.removeAttribute('style');
                res();
            }, Math.max(200, duration));
        });
    } catch (err) {
        return Promise.resolve();
    }
}

/**
 * Carga el historial completo con filtros
 */
async function cargarHistorialCompleto() {
    try {
        const socioId = document.getElementById('filter-aporte-socio').value;
        const desde = document.getElementById('filter-aporte-desde').value;
        const hasta = document.getElementById('filter-aporte-hasta').value;

        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        let query = supabase
            .from('ic_aportes_semanales')
            .select('*, socio:ic_socios!id_socio(nombre)')
            .order('fecha', { ascending: false });

        if (socioId) query = query.eq('id_socio', socioId);
        if (desde) query = query.gte('fecha', desde);
        if (hasta) query = query.lte('fecha', hasta);

        const { data, error } = await query;

        if (error) throw error;

        renderHistorialAportes(data);

    } catch (error) {
        console.error('Error al cargar historial completo:', error);
        showToast('Error al cargar historial', 'error');
    }
}

/**
 * Renderiza el historial completo en el modal
 */
function renderHistorialAportes(data) {
    const container = document.getElementById('lista-historial-aportes');
    const summaryContainer = document.getElementById('summary-historial-aportes');
    const labelTotalMonto = document.getElementById('resumen-total-monto');
    const labelTotalConteo = document.getElementById('resumen-total-conteo');

    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = '<tr><td colspan="5" class="text-center py-5">No se encontraron aportes con los filtros seleccionados</td></tr>';
        if (summaryContainer) summaryContainer.style.display = 'none';
        return;
    }

    // Calcular estadísticas
    let totalMonto = 0;
    data.forEach(item => {
        totalMonto += parseFloat(item.monto || 0);
    });

    // Actualizar UI de resumen
    if (summaryContainer) {
        summaryContainer.style.display = 'flex';
        if (labelTotalMonto) labelTotalMonto.textContent = `$${totalMonto.toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        if (labelTotalConteo) labelTotalConteo.textContent = data.length;
    }

    // Agrupar por semanas (Lunes a Sábado/Domingo) y Sub-semanas
    // Usamos Lunes 17 Nov 2025 como Semana 1 para que los primeros registros sean positivos
    const anchor = new Date(2025, 10, 17, 12, 0, 0);
    const groups = {};

    data.forEach(item => {
        let weekNum;
        let monday;

        // Si sub_semana tiene un número (Semana forzada), usamos ese para el grupo
        if (item.sub_semana && !isNaN(item.sub_semana)) {
            weekNum = parseInt(item.sub_semana);
            monday = new Date(anchor);
            monday.setDate(anchor.getDate() + (weekNum - 1) * 7);
        } else {
            const d = new Date(item.fecha + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - (day === 0 ? 6 : day - 1);
            monday = new Date(d);
            monday.setDate(diff);
            monday.setHours(12, 0, 0, 0);

            const diffMs = monday.getTime() - anchor.getTime();
            weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
        }

        const groupKey = `${weekNum}`;

        const saturday = new Date(monday);
        saturday.setDate(monday.getDate() + 5);

        const saturdayStr = saturday.toLocaleDateString('es-EC', { day: 'numeric', month: 'short' });
        const weekLabel = `Semana ${weekNum} (SÁB ${saturdayStr})`;

        if (!groups[groupKey]) {
            groups[groupKey] = { label: weekLabel, items: [], sortVal: weekNum };
        }
        groups[groupKey].items.push(item);
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => groups[b].sortVal - groups[a].sortVal);

    let html = '';
    sortedGroupKeys.forEach(key => {
        const group = groups[key];
        
        // Fila de encabezado de semana
        html += `
            <tr class="week-group-header">
                <td colspan="5" style="background: rgba(242, 187, 58, 0.08); border-left: 4px solid #f2bb3a; padding: 12px 15px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 800; color: #f2bb3a; letter-spacing: 0.5px; font-size: 0.95rem; text-transform: uppercase;">
                            <i class="fas fa-calendar-week mr-2"></i> ${group.label}
                        </span>
                        <span class="badge" style="background: rgba(242, 187, 58, 0.15); color: #f2bb3a; font-weight: 700; border-radius: 20px; padding: 4px 12px; font-size: 0.75rem;">
                            ${group.items.length} REGISTRO${group.items.length !== 1 ? 'S' : ''}
                        </span>
                    </div>
                </td>
            </tr>
        `;

        // Agrupar aportes por socio dentro de la semana para visualización compacta
        const aportesAgrupados = {};
        group.items.forEach(item => {
            const id = item.id_socio;
            if (!aportesAgrupados[id]) {
                aportesAgrupados[id] = {
                    socio: item.socio,
                    id_socio: item.id_socio,
                    montoTotal: parseFloat(item.monto),
                    detalles: [{
                        monto: parseFloat(item.monto),
                        fecha: item.fecha,
                        comprobante: item.comprobante_url,
                        id_aporte: item.id_aporte,
                        created_at: item.created_at
                    }],
                    sub_semana: item.sub_semana,
                    es_igualacion: item.es_igualacion
                };
            } else {
                aportesAgrupados[id].montoTotal += parseFloat(item.monto);
                aportesAgrupados[id].detalles.push({
                    monto: parseFloat(item.monto),
                    fecha: item.fecha,
                    comprobante: item.comprobante_url,
                    id_aporte: item.id_aporte,
                    created_at: item.created_at
                });
                if (item.es_igualacion) aportesAgrupados[id].es_igualacion = true;
            }
        });

        Object.values(aportesAgrupados).forEach(agrupado => {
            const initial = (agrupado.socio?.nombre || 'S').charAt(0);
            const multi = agrupado.detalles.length > 1;
            
            html += `
                <tr class="fade-in">
                    <td>
                        <div class="d-flex align-items-center" style="gap: 12px;">
                            <div class="d-flex flex-column">
                                <span class="font-weight-bold" style="color: #fff; font-size: 0.95rem;">${formatDate(agrupado.detalles[0].fecha)}</span>
                                ${multi ? `<span class="badge" style="background: rgba(242, 187, 58, 0.1); color: var(--gold); font-size: 0.65rem; padding: 2px 6px; width: fit-content; margin-top: 2px;">+ ${agrupado.detalles.length - 1} ABONOS extra</span>` : ''}
                            </div>
                            <button class="btn-icon-tiny" onclick="gestionarSemana('${agrupado.detalles[0].id_aporte}', '${agrupado.detalles[0].fecha}', '${agrupado.sub_semana || ''}', '${agrupado.id_socio}', '${agrupado.socio?.nombre || ''}')" title="Gestionar Semana" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary);">
                                <i class="fas fa-pencil-alt" style="font-size: 0.75rem;"></i>
                            </button>
                            <button class="btn-icon-tiny" onclick="window.eliminarAporte('${agrupado.detalles[0].id_aporte}')" title="Eliminar Registro" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444;">
                                <i class="fas fa-trash-alt" style="font-size: 0.75rem;"></i>
                            </button>
                        </div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center">
                            <div class="avatar-initial" style="width: 36px; height: 36px; font-size: 0.9rem; background: var(--primary-light); color: white; margin-right: 12px;">${initial}</div>
                            <div class="d-flex flex-column">
                                <span class="font-weight-600" style="font-size: 1rem; color: #fff; letter-spacing: 0.3px;">${agrupado.socio?.nombre || 'Socio'}</span>
                                ${agrupado.es_igualacion ? '<span class="badge badge-warning" style="font-size: 0.6rem; background: #f2bb3a; color: #000; font-weight: 800; padding: 1px 5px; width: fit-content;"><i class="fas fa-clock"></i> IGUALACIÓN</span>' : ''}
                            </div>
                        </div>
                    </td>
                    <td>
                        <div class="d-flex flex-column align-items-start">
                            <span class="text-amount" style="font-size: 1.1rem; color: #10B981; font-weight: 800;">$${agrupado.montoTotal.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                            ${multi ? `<a href="javascript:void(0)" class="text-gold" style="font-size: 0.7rem; text-decoration: none; display: flex; align-items: center; gap: 4px; margin-top: 2px;" onclick="toggleDetalleAportes('${agrupado.id_socio}_${key}')">
                                Detalle de abonos <i class="fas fa-chevron-down" style="font-size: 0.6rem;"></i>
                            </a>` : ''}
                        </div>
                    </td>
                    <td class="text-center">
                        <div class="d-flex justify-content-center gap-2">
                            ${agrupado.detalles.map(d => `
                                <a href="${d.comprobante}" target="_blank" class="comprobante-link" title="Ver $${d.monto} (${formatDate(d.fecha)})" style="width: 30px; height: 30px; border-radius: 6px; background: rgba(242, 187, 58, 0.1); border: 1px solid rgba(242, 187, 58, 0.2); display: flex; align-items: center; justify-content: center; color: var(--gold);">
                                    <i class="fas fa-image" style="font-size: 0.9rem;"></i>
                                </a>
                            `).join('')}
                        </div>
                    </td>
                    <td class="text-right">
                        <div class="d-flex flex-column">
                            <span style="color: var(--text-secondary); font-size: 0.85rem; font-weight: 600;">${formatDateTime(agrupado.detalles[0].created_at).split(' ')[0]}</span>
                            <small class="text-muted" style="font-size: 0.7rem;">${formatDateTime(agrupado.detalles[0].created_at).split(' ')[1] || ''}</small>
                        </div>
                    </td>
                </tr>
                ${multi ? `
                <tr id="detalle_${agrupado.id_socio}_${key}" class="hidden" style="background: rgba(0,0,0,0.2); transition: all 0.3s ease;">
                    <td colspan="5" style="padding: 15px 40px;">
                        <div style="border-left: 3px solid var(--gold); padding: 5px 0 5px 25px; position: relative;">
                            <div class="mb-3" style="font-size: 0.7rem; color: var(--gold); font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8;">
                                Desglose de Contribuciones
                            </div>
                            
                            <div class="d-flex flex-column gap-1">
                                ${agrupado.detalles.map(d => `
                                    <div class="d-flex align-items-center py-3 border-bottom" style="border-color: rgba(255,255,255,0.05) !important;">
                                        <div style="width: 140px;">
                                            <i class="far fa-calendar-check mr-2 text-gold" style="font-size: 0.85rem; opacity: 0.8;"></i>
                                            <span style="font-size: 0.9rem; color: #fff; font-weight: 500;">${formatDate(d.fecha)}</span>
                                        </div>
                                        <div class="flex-grow-1 px-3">
                                            <small style="color: rgba(255,255,255,0.4); font-size: 0.75rem; background: rgba(255,255,255,0.03); padding: 4px 10px; border-radius: 6px; display: inline-flex; align-items: center;">
                                                <i class="fas fa-history mr-2" style="font-size: 0.65rem; color: var(--gold); opacity: 0.6;"></i> 
                                                Registrado el ${formatDateTime(d.created_at)}
                                            </small>
                                        </div>
                                        <div class="text-right" style="width: 150px; display: flex; align-items: center; justify-content: flex-end; gap: 10px;">
                                            <span class="text-white" style="font-size: 1rem; font-weight: 700; letter-spacing: 0.3px;">$${d.monto.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                                            <button class="btn-icon-tiny" onclick="gestionarSemana('${d.id_aporte}', '${d.fecha}', '${agrupado.sub_semana || ''}', '${agrupado.id_socio}', '${agrupado.socio?.nombre || ''}')" title="Editar / Reemplazar Comprobante" style="background: rgba(242, 187, 58, 0.1); border: 1px solid rgba(242, 187, 58, 0.2); color: var(--gold); width: 28px; height: 28px;">
                                                <i class="fas fa-pencil-alt" style="font-size: 0.7rem;"></i>
                                            </button>
                                            <button class="btn-icon-tiny" onclick="window.eliminarAporte('${d.id_aporte}')" title="Eliminar Registro" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; width: 28px; height: 28px;">
                                                <i class="fas fa-trash-alt" style="font-size: 0.7rem;"></i>
                                            </button>
                                        </div>
                                    </div>
                                `).join('')}
                            </div>

                            <div class="d-flex justify-content-between align-items-center pt-4 mt-3 border-top" style="border-color: rgba(255,255,255,0.1) !important;">
                                <div class="d-flex align-items-center" style="gap: 10px;">
                                    <i class="fas fa-file-invoice-dollar" style="color: var(--text-muted); font-size: 0.9rem;"></i>
                                    <span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic; letter-spacing: 0.2px;">
                                        ${agrupado.detalles.length} comprobantes vinculados
                                    </span>
                                </div>
                                <div class="text-right d-flex align-items-center" style="gap: 15px;">
                                    <span style="font-size: 0.8rem; color: var(--text-secondary); font-weight: 700; letter-spacing: 0.5px; white-space: nowrap;">TOTAL SEMANA:</span>
                                    <strong class="text-gold" style="font-size: 1.4rem; font-weight: 900; letter-spacing: 0.8px; text-shadow: 0 0 15px rgba(242, 187, 58, 0.2); line-height: 1;">$${agrupado.montoTotal.toLocaleString('es-EC', { minimumFractionDigits: 2 })}</strong>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>` : ''}
            `;
        });
    });

    container.innerHTML = html;
}

/**
 * Abre visualización de comprobante
 */
function verComprobanteAporte(url) {
    if (!url) return;
    
    // Si contiene multiples URLs (separadas por '|')
    if (url.includes('|')) {
        const urls = url.split('|');
        urls.forEach((u, index) => {
            if (u.trim()) {
                // Abrir cada uno en una pestaña después de un pequeño delay para evitar bloqueos del navegador
                setTimeout(() => {
                    window.open(u.trim(), '_blank');
                }, index * 250);
            }
        });
    } else {
        window.open(url, '_blank');
    }
}

/**
 * Función para gestionar la semana y sub-división de un aporte, con opción de reemplazar comprobante
 */
async function gestionarSemana(idAporte, fechaActual, subActual, idSocio = null, nombreSocio = '') {
    try {
        // Al gestionar, si el aporte ya tenía una semana objetivo (subActual es número), la bloqueamos
        if (subActual && !isNaN(subActual)) {
            forcedTargetWeek = parseInt(subActual);
        } else {
            // Si no, calculamos la semana real de la fecha actual por si acaso
            const anchor = new Date(2025, 10, 17, 12, 0, 0);
            const d = new Date(fechaActual + 'T12:00:00');
            const day = d.getDay();
            const diff = d.getDate() - (day === 0 ? 6 : day - 1);
            const mon = new Date(d);
            mon.setDate(diff);
            const diffMs = mon.getTime() - anchor.getTime();
            forcedTargetWeek = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
        }

        const { value: formValues } = await Swal.fire({
            title: 'Gestionar Registro de Aporte',
            background: '#1a1d21',
            color: '#ffffff',
            html: `
                <div style="text-align: left; padding: 10px;">
                    <label style="display: block; margin-bottom: 5px; color: #f2bb3a;">Fecha del Aporte</label>
                    <input type="date" id="swal-fecha-aporte" class="swal2-input" value="${fechaActual}" style="width: 100%; margin: 0 0 15px 0;">
                    
                    <div style="margin-top: 15px; display: flex; align-items: center; gap: 10px;">
                        <input type="checkbox" id="swal-es-igualacion" style="width: 20px; height: 20px;">
                        <label for="swal-es-igualacion" style="color: #f2bb3a; font-weight: bold; margin: 0;">Marcar como IGUALACIÓN</label>
                    </div>

                    ${idSocio ? `
                    <div style="margin-top: 25px; padding: 15px; background: rgba(242, 187, 58, 0.1); border: 1px dashed rgba(242, 187, 58, 0.3); border-radius: 12px; text-align: center;">
                        <p style="font-size: 0.85rem; margin-bottom: 12px; color: #fff;">Añadir más abonos para <strong>${nombreSocio}</strong> en esta semana:</p>
                        <button type="button" class="btn btn-primary btn-glow" style="width: 100%; padding: 8px; font-size: 0.85rem;" onclick="prepararAporteAdicional('${idSocio}', '${fechaActual}')">
                            <i class="fas fa-plus-circle"></i> Nuevo Abono
                        </button>
                    </div>
                    ` : ''}
                </div>
            `,
            didOpen: () => {
                const supabase = window.getSupabaseClient();
                supabase.from('ic_aportes_semanales').select('es_igualacion').eq('id_aporte', idAporte).single()
                    .then(({data}) => {
                        if (data && data.es_igualacion) document.getElementById('swal-es-igualacion').checked = true;
                    });
            },
            focusConfirm: false,
            preConfirm: () => {
                return {
                    fecha: document.getElementById('swal-fecha-aporte').value,
                    es_igualacion: document.getElementById('swal-es-igualacion').checked
                }
            },
            showCancelButton: true,
            confirmButtonText: 'Guardar Cambios',
            showDenyButton: true,
            denyButtonText: '<i class="fas fa-trash"></i> Eliminar Registro',
            cancelButtonText: 'Cancelar',
            customClass: {
                confirmButton: 'btn btn-primary',
                denyButton: 'btn btn-danger',
                cancelButton: 'btn btn-secondary'
            }
        });

        if (Swal.isVisible() && Swal.getDenyButton() === document.activeElement) {
            // Manejar eliminación
            const result = await Swal.fire({
                title: '¿Eliminar este aporte?',
                text: 'Esta acción no se puede deshacer y el dinero se restará de la caja.',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar',
                background: '#1a1d21',
                color: '#fff'
            });

            if (result.isConfirmed) {
                beginLoading('Eliminando aporte...');
                const { error } = await supabase.from('ic_aportes_semanales').delete().eq('id_aporte', idAporte);
                if (error) throw error;
                showToast('Aporte eliminado correctamente', 'success');
                await cargarHistorialCompleto();
                await cargarDatosAportes();
            }
            return;
        }

        if (formValues) {
            beginLoading('Actualizando datos...');
            const supabase = window.getSupabaseClient();
            
            const updateData = {
                fecha: formValues.fecha,
                es_igualacion: formValues.es_igualacion
            };

            const { error } = await supabase
                .from('ic_aportes_semanales')
                .update(updateData)
                .eq('id_aporte', idAporte);

            if (error) throw error;

            showToast('Información actualizada correctamente', 'success');
            await cargarHistorialCompleto();
            await cargarDatosAportes();
        }
    } catch (error) {
        console.error('Error al gestionar semana:', error);
        showToast('Error al actualizar los datos', 'error');
    } finally {
        endLoading();
    }
}

/**
 * Elimina un registro de aporte de forma directa
 */
async function eliminarAporte(idAporte) {
    try {
        const result = await Swal.fire({
            title: '¿Eliminar este aporte?',
            text: 'Esta acción no se puede deshacer y el dinero se restará de la caja.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar',
            cancelButtonText: 'Cancelar',
            background: '#1a1d21',
            color: '#fff'
        });

        if (result.isConfirmed) {
            beginLoading('Eliminando aporte...');
            const supabase = window.getSupabaseClient();
            const { error } = await supabase.from('ic_aportes_semanales').delete().eq('id_aporte', idAporte);
            if (error) throw error;
            
            showToast('Aporte eliminado correctamente', 'success');
            await cargarHistorialCompleto();
            await cargarDatosAportes();
        }
    } catch (error) {
        console.error('Error al eliminar aporte:', error);
        showToast('Error al eliminar aporte', 'error');
    } finally {
        endLoading();
    }
}

/**
 * Muestra una ventana con los aportes pendientes por socio y semana
 */
async function verAportesPendientes() {
    try {
        beginLoading('Calculando pendientes...');
        const supabase = window.getSupabaseClient();
        
        // Cargar todos los aportes para calcular deudas
        const { data: todosAportes, error } = await supabase
            .from('ic_aportes_semanales')
            .select('id_socio, fecha, sub_semana, monto');
            
        if (error) throw error;

        const anchor = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov
        const hoy = new Date();
        const sociosObjetivo = sociosAportes.filter(s => ['69c69e99', 'be3ff55b', '20b691de'].includes(s.idsocio));
        
        // Calcular semanas transcurridas hasta hoy
        const day = hoy.getDay();
        const inicioSemanaActual = new Date(hoy);
        inicioSemanaActual.setDate(hoy.getDate() - (day === 0 ? 6 : day - 1));
        inicioSemanaActual.setHours(0, 0, 0, 0);
        
        const diffMs = inicioSemanaActual.getTime() - anchor.getTime();
        const maxWeek = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

        const pendientes = [];

        // Por cada semana desde la 1 hasta hoy
        for (let w = 1; w <= maxWeek; w++) {
            sociosObjetivo.forEach(socio => {
                const montoAportadoEnSemana = todosAportes
                    .filter(a => a.id_socio === socio.idsocio)
                    .reduce((total, a) => {
                        // Calcular semana efectiva: sub_semana (forzada) o calculada por fecha
                        let aw;
                        if (a.sub_semana && !isNaN(a.sub_semana)) {
                            aw = parseInt(a.sub_semana);
                        } else {
                            const ad = new Date(a.fecha + 'T12:00:00');
                            const aday = ad.getDay();
                            const adiff = ad.getDate() - (aday === 0 ? 6 : aday - 1);
                            const amon = new Date(ad); amon.setDate(adiff); amon.setHours(12, 0, 0, 0);
                            aw = Math.floor((amon.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
                        }
                        return aw === w ? total + parseFloat(a.monto || 0) : total;
                    }, 0);

                // Solo aparece en pendientes si el aporte es CERO
                if (montoAportadoEnSemana === 0) {
                    const monDate = new Date(anchor);
                    monDate.setDate(anchor.getDate() + (w - 1) * 7);
                    pendientes.push({
                        socioNom: socio.nombre,
                        socioId: socio.idsocio,
                        semana: w,
                        sub: '', 
                        fechaSugerida: monDate.toISOString().split('T')[0]
                    });
                }
            });
        }

        endLoading();

        if (pendientes.length === 0) {
            Swal.fire({ title: '¡Todo al día!', text: 'Sin pendientes.', icon: 'success', background: '#1a1d21', color: '#fff' });
            return;
        }

        const { value: selected } = await Swal.fire({
            title: '<i class="fas fa-exclamation-circle text-danger"></i> Aportes Pendientes',
            background: '#1a1d21',
            color: '#fff',
            width: '600px',
            html: `
                <div style="max-height: 400px; overflow-y: auto; text-align: left; padding: 10px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                        <thead style="border-bottom: 2px solid #334155;">
                            <tr><th style="padding: 10px;">Socio</th><th style="padding: 10px;">Semana</th><th style="padding: 10px; text-align: center;">Acción</th></tr>
                        </thead>
                        <tbody>
                            ${pendientes.reverse().map(p => `
                                <tr style="border-bottom: 1px solid #334155;">
                                    <td style="padding: 10px;">
                                        <div class="d-flex flex-column">
                                            <b>${p.socioNom}</b>
                                        </div>
                                    </td>
                                    <td style="padding: 10px;">Semana ${p.semana}${p.sub}</td>
                                    <td style="padding: 10px; text-align: center;">
                                        <button onclick="window.igualarAportePendiente('${p.socioId}', '${p.socioNom}', '${p.fechaSugerida}', '${p.semana}')" 
                                                style="background: #0E5936; color: white; border: none; padding: 5px 12px; border-radius: 4px; cursor: pointer;">
                                            <i class="fas fa-check"></i> Igualar
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`,
            showConfirmButton: false, showCloseButton: true
        });
    } catch (err) { endLoading(); showToast('Error al cargar pendientes', 'error'); }
}

window.igualarAportePendiente = (idSocio, nombre, fecha, sub) => {
    Swal.close();
    resetFormAporte();
    
    // Bloquear la semana antes de abrir el modal
    if (sub) {
        forcedTargetWeek = parseInt(sub);
    } else {
        // Si no viene sub (semana forzada), calculamos la semana de la fecha de la deuda
        const anchor = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov
        const d = new Date(fecha + 'T12:00:00');
        const day = d.getDay();
        const diff = d.getDate() - (day === 0 ? 6 : day - 1);
        const monday = new Date(d);
        monday.setDate(diff);
        monday.setHours(12, 0, 0, 0);
        const diffMs = monday.getTime() - anchor.getTime();
        forcedTargetWeek = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
    }

    const modal = document.getElementById('modal-aporte');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    document.getElementById('aporte-socio').value = idSocio;
    document.getElementById('aporte-socio-search').value = nombre;
    document.getElementById('aporte-socio-selected').innerHTML = `<div class="selected-socio-item"><div class="avatar-initial">${nombre.charAt(0)}</div><span>${nombre}</span></div>`;
    document.getElementById('aporte-socio-selected').classList.remove('hidden');
    
    // Ponemos la fecha de HOY por defecto para el registro real
    document.getElementById('aporte-fecha').value = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' });
    
    document.getElementById('aporte-igualacion').checked = true;
    
    // Setear selector manual
    llenarSelectorSemanasManual(forcedTargetWeek);
    const selectManual = document.getElementById('aporte-week-override');
    if (selectManual) selectManual.value = forcedTargetWeek;
    
    // Actualizar el banner (que ahora respetará forcedTargetWeek aunque la fecha sea hoy)
    updateStatusSemana();
};

/**
 * Genera el reporte PDF de aportes (Solicita fecha o rango)
 */
async function generateAportesReport() {
    try {
        const { value: formValues } = await Swal.fire({
            title: 'Reporte de Aportes',
            width: '500px',
            background: '#ffffff',
            customClass: {
                popup: 'premium-swal-popup'
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
                        <button type="button" class="report-mode-btn" data-mode="all" id="btn-mode-all">
                            <i class="fas fa-globe"></i> GENERAL
                        </button>
                    </div>

                    <p id="export-mode-desc" style="margin-bottom: 20px; color: #64748B; font-size: 0.9rem; text-align: center;">
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

                    <!-- Sección GENERAL (Oculta) -->
                    <div id="container-all" class="mode-container hidden">
                        <div class="filter-group-corporate" style="text-align: center; padding: 20px;">
                            <i class="fas fa-info-circle" style="font-size: 2rem; color: #0E5936; margin-bottom: 10px; display: block;"></i>
                            <p style="margin: 0; color: #1E293B; font-weight: 600;">Se incluirán todos los registros históricos.</p>
                        </div>
                    </div>

                    <!-- NUEVO: Selector de Aportante -->
                    <div class="filter-group-corporate" style="margin-top: 20px; background: #2d3238; border-color: #3f444a; position: relative;">
                        <label class="export-label-corporate" style="color: #f2bb3a;">
                            <i class="fas fa-user" style="margin-right: 8px; color: #F2BB3A;"></i>Aportante(s)
                        </label>
                        <div class="input-with-icon" style="position: relative;">
                            <i class="fas fa-search" style="position: absolute; left: 10px; top: 12px; color: #94a3b8;"></i>
                            <input type="text" id="swal-socio-search" class="premium-input-swal" placeholder="Buscar aportante..." style="padding-left: 35px; background: #1a1d21; color: #fff; border-color: #3f444a;" autocomplete="off">
                            <input type="hidden" id="swal-socio-id" value="ALL">
                            <div id="swal-socio-suggestions" class="hidden" style="position: absolute; top: 100%; left: 0; right: 0; background: #1a1d21; border: 1px solid #3f444a; border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.8); z-index: 99999; max-height: none; overflow: visible; margin-top: 5px;"></div>
                        </div>
                        <div id="swal-socio-selected-container" style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px;">
                            <!-- Aquí se insertarán los tags -->
                            <div id="tag-all-socios" class="swal-socio-tag" style="background: #3f444a; color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; display: flex; align-items: center; gap: 5px;">
                                <span>TODOS LOS APORTANTES</span>
                            </div>
                        </div>
                    </div>
                </div>

                <style>
                    /* Estilos Corporativos Dark Mode */
                    .premium-swal-popup {
                        border-radius: 1.25rem;
                        padding-bottom: 1.5rem;
                        background: #1a1d21 !important;
                        color: #ffffff !important;
                        overflow-y: visible !important; /* Permitir que la lista se vea fuera del modal */
                    }

                    .swal-socio-tag {
                        background: #3f444a;
                        color: #fff;
                        padding: 4px 10px;
                        border-radius: 20px;
                        font-size: 0.8rem;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        border: 1px solid rgba(242, 187, 58, 0.3);
                        animation: fadeIn 0.2s ease;
                    }

                    .swal-socio-tag i {
                        cursor: pointer;
                        color: #EF4444;
                        font-size: 0.9rem;
                    }

                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(5px); }
                        to { opacity: 1; transform: translateY(0); }
                    }

                    .swal2-html-container {
                        overflow: visible !important; /* Evitar scroll interno del modal */
                        z-index: 10 !important; /* Prioridad sobre el footer del modal */
                    }

                    .swal2-actions {
                        z-index: 1 !important; /* Los botones se quedan atrás de la lista */
                    }

                    .report-mode-selector {
                        display: flex;
                        background: #2d3238;
                        border-radius: 12px;
                        padding: 4px;
                        margin-bottom: 20px;
                        border: 1px solid #3f444a;
                    }

                    .report-mode-btn {
                        flex: 1;
                        padding: 10px 15px;
                        border: none;
                        background: transparent;
                        color: #94a3b8;
                        font-size: 0.8rem;
                        font-weight: 700;
                        cursor: pointer;
                        border-radius: 8px;
                        transition: all 0.3s ease;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                    }

                    .report-mode-btn.active {
                        color: #000000;
                        background: #f2bb3a; 
                        box-shadow: 0 4px 10px rgba(242, 187, 58, 0.2);
                    }

                    .export-label-corporate {
                        display: block; 
                        font-weight: 700; 
                        margin-bottom: 8px; 
                        color: #f2bb3a;
                        font-size: 0.85rem;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }

                    .filter-group-corporate {
                        background: #2d3238;
                        padding: 10px;
                        border-radius: 10px;
                        border: 1px solid #3f444a;
                    }

                    .premium-input-swal {
                        width: 100%;
                        padding: 10px;
                        border-radius: 8px;
                        border: 1px solid #3f444a;
                        font-family: inherit;
                        font-size: 0.95rem;
                        color: #ffffff;
                        background: #1a1d21;
                        outline: none;
                        transition: border-color 0.2s;
                    }

                    .premium-input-swal:focus {
                        border-color: #f2bb3a;
                        box-shadow: 0 0 0 3px rgba(242, 187, 58, 0.1);
                    }

                    .swal-suggestion-item {
                        color: #fff !important;
                        border-bottom: 1px solid #3f444a !important;
                    }
                    .swal-suggestion-item:hover {
                        background: #3f444a !important;
                    }

                    .hidden { display: none; }
                </style>
            `,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-file-pdf"></i> Generar PDF',
            cancelButtonText: 'Cancelar',
            confirmButtonColor: '#0E5936',
            cancelButtonColor: '#64748B',
            focusConfirm: false,
            didOpen: () => {
                Swal.getPopup().style.borderRadius = '1.25rem';

                const btnMonth = Swal.getHtmlContainer().querySelector('#btn-mode-month');
                const btnRange = Swal.getHtmlContainer().querySelector('#btn-mode-range');
                const btnAll = Swal.getHtmlContainer().querySelector('#btn-mode-all');
                
                const containerMonth = Swal.getHtmlContainer().querySelector('#container-month');
                const containerRange = Swal.getHtmlContainer().querySelector('#container-range');
                const containerAll = Swal.getHtmlContainer().querySelector('#container-all');
                
                const desc = Swal.getHtmlContainer().querySelector('#export-mode-desc');

                btnMonth.addEventListener('click', () => {
                    [btnMonth, btnRange, btnAll].forEach(b => b.classList.remove('active'));
                    btnMonth.classList.add('active');
                    [containerMonth, containerRange, containerAll].forEach(c => c.classList.add('hidden'));
                    containerMonth.classList.remove('hidden');
                    desc.textContent = 'Seleccione el mes para el reporte consolidado.';
                });

                btnRange.addEventListener('click', () => {
                    [btnMonth, btnRange, btnAll].forEach(b => b.classList.remove('active'));
                    btnRange.classList.add('active');
                    [containerMonth, containerRange, containerAll].forEach(c => c.classList.add('hidden'));
                    containerRange.classList.remove('hidden');
                    desc.textContent = 'Defina un rango de fechas personalizado.';
                });

                btnAll.addEventListener('click', () => {
                    [btnMonth, btnRange, btnAll].forEach(b => b.classList.remove('active'));
                    btnAll.classList.add('active');
                    [containerMonth, containerRange, containerAll].forEach(c => c.classList.add('hidden'));
                    containerAll.classList.remove('hidden');
                    desc.textContent = 'Generar reporte de todos los aportes existentes.';
                });

                // Lógica de búsqueda de aportante en el modal
                let selectedSocioIds = [];
                const socioSearch = Swal.getHtmlContainer().querySelector('#swal-socio-search');
                const socioIdHidden = Swal.getHtmlContainer().querySelector('#swal-socio-id');
                const suggestionsBox = Swal.getHtmlContainer().querySelector('#swal-socio-suggestions');
                const tagsContainer = Swal.getHtmlContainer().querySelector('#swal-socio-selected-container');

                const renderSocioTags = () => {
                    if (selectedSocioIds.length === 0) {
                        tagsContainer.innerHTML = `
                            <div id="tag-all-socios" class="swal-socio-tag">
                                <span>TODOS LOS APORTANTES</span>
                            </div>`;
                        socioIdHidden.value = 'ALL';
                    } else {
                        tagsContainer.innerHTML = selectedSocioIds.map(id => {
                            const s = sociosAportes.find(soc => soc.idsocio === id);
                            return `
                                <div class="swal-socio-tag" data-id="${id}">
                                    <span>${s ? s.nombre : id}</span>
                                    <i class="fas fa-times btn-remove-tag" data-id="${id}"></i>
                                </div>`;
                        }).join('');
                        socioIdHidden.value = selectedSocioIds.join(',');

                        tagsContainer.querySelectorAll('.btn-remove-tag').forEach(btn => {
                            btn.addEventListener('click', (e) => {
                                const idToRemove = btn.getAttribute('data-id');
                                selectedSocioIds = selectedSocioIds.filter(id => id !== idToRemove);
                                renderSocioTags();
                            });
                        });
                    }
                };

                if (socioSearch) {
                    socioSearch.addEventListener('input', (e) => {
                        const q = e.target.value.toLowerCase().trim();
                        if (q.length < 1) {
                            suggestionsBox.innerHTML = '';
                            suggestionsBox.classList.add('hidden');
                            return;
                        }

                        const matches = (sociosAportes || []).filter(s => 
                            (s.nombre || '').toLowerCase().includes(q) && !selectedSocioIds.includes(s.idsocio)
                        ).slice(0, 5);

                        if (matches.length > 0) {
                            suggestionsBox.innerHTML = matches.map(m => `
                                <div class="swal-suggestion-item" data-id="${m.idsocio}" data-name="${m.nombre}" style="padding: 10px; cursor: pointer; border-bottom: 1px solid #3f444a; font-size: 0.9rem; color: #fff;">
                                    ${m.nombre}
                                </div>
                            `).join('');
                            suggestionsBox.classList.remove('hidden');

                            suggestionsBox.querySelectorAll('.swal-suggestion-item').forEach(item => {
                                item.addEventListener('click', () => {
                                    const id = item.getAttribute('data-id');
                                    if (!selectedSocioIds.includes(id)) {
                                        selectedSocioIds.push(id);
                                        renderSocioTags();
                                    }
                                    socioSearch.value = '';
                                    suggestionsBox.classList.add('hidden');
                                });
                            });
                        } else {
                            suggestionsBox.innerHTML = '<div style="padding: 10px; color: #64748B;">No se encontraron socios</div>';
                            suggestionsBox.classList.remove('hidden');
                        }
                    });

                    // Cerrar sugerencias al hacer clic fuera
                    document.addEventListener('click', (ev) => {
                        if (!socioSearch.contains(ev.target) && !suggestionsBox.contains(ev.target)) {
                            suggestionsBox.classList.add('hidden');
                        }
                    });
                }
            },
            preConfirm: () => {
                const activeMode = Swal.getHtmlContainer().querySelector('.report-mode-btn.active').getAttribute('data-mode');
                const socioId = document.getElementById('swal-socio-id').value;
                
                if (activeMode === 'range') {
                    const start = document.getElementById('swal-start').value;
                    const end = document.getElementById('swal-end').value;
                    if (!start || !end) {
                        Swal.showValidationMessage('Por favor seleccione ambas fechas');
                        return false;
                    }
                    return { type: 'range', start, end, socioId };
                } else if (activeMode === 'month') {
                    const month = document.getElementById('swal-month').value;
                    if (!month) {
                        Swal.showValidationMessage('Por favor seleccione el mes');
                        return false;
                    }
                    return { type: 'month', month, socioId };
                } else {
                    return { type: 'all', socioId };
                }
            }
        });

        if (!formValues) return;

        await generatePDFReporteAportes(formValues);

    } catch (error) {
        console.error('Error al abrir modal de reporte:', error);
        Swal.fire('Error', error.message, 'error');
    }
}

/**
 * Genera el documento PDF con los aportes y comprobantes
 */
async function generatePDFReporteAportes(params) {
    let startDate, endDate, titlePeriod;

    if (params.type === 'month') {
        const [year, month] = params.month.split('-');
        startDate = `${year}-${month}-01`;
        endDate = `${year}-${month}-${new Date(year, month, 0).getDate()}`;
        const monthNames = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
        titlePeriod = `${monthNames[parseInt(month) - 1]} ${year}`;
    } else if (params.type === 'range') {
        startDate = params.start;
        endDate = params.end;
        titlePeriod = `${startDate} AL ${endDate}`;
    } else {
        titlePeriod = "GENERAL (TODO EL HISTORIAL)";
        endDate = new Date().toISOString().split('T')[0];
    }

    // Ajustar título si es para un socio específico
    if (params.socioId !== 'ALL') {
        const ids = params.socioId.split(',');
        const names = ids.map(id => {
            const s = sociosAportes.find(soc => soc.idsocio === id);
            return s ? s.nombre : id;
        });
        titlePeriod += ` - SOCIO(S): ${names.join(', ')}`;
    }

    if (typeof window.enableLoader === 'function') window.enableLoader();
    window.showLoader(`Generando reporte PDF de aportes...`);

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const supabase = window.getSupabaseClient();

        // 1. Obtener los aportes del periodo
        let query = supabase
            .from('ic_aportes_semanales')
            .select('*, socio:ic_socios(nombre)')
            .order('fecha', { ascending: true });

        if (params.type !== 'all') {
            query = query.gte('fecha', startDate).lte('fecha', endDate);
        }

        if (params.socioId !== 'ALL') {
            const ids = params.socioId.split(',');
            query = query.in('id_socio', ids);
        }

        const { data: rawAportes, error: errorAportes } = await query;

        if (errorAportes) throw errorAportes;

        // --- Lógica de Agrupación por Semanas y Detección de Faltantes ---
        const anchor = new Date(2025, 10, 17, 12, 0, 0);
        
        let socioListForReport = [];
        if (params.socioId === 'ALL') {
            socioListForReport = sociosAportes.filter(s => ['69c69e99', 'be3ff55b', '20b691de'].includes(s.idsocio));
        } else {
            const idsSelections = params.socioId.split(',');
            socioListForReport = sociosAportes.filter(s => idsSelections.includes(s.idsocio));
        }

        const groups = {};

        // 2. Obtener acumulado de cada persona involucrada (hasta la fecha final del reporte)
        let idSociosParaAcumulado = [];
        if (params.socioId === 'ALL') {
            idSociosParaAcumulado = [...new Set(rawAportes.map(a => a.id_socio))];
        } else {
            idSociosParaAcumulado = params.socioId.split(',');
        }

        const { data: acumulados, error: errorAcum } = await supabase
            .from('ic_aportes_semanales')
            .select('id_socio, monto')
            .lte('fecha', endDate)
            .in('id_socio', idSociosParaAcumulado);

        if (errorAcum) throw errorAcum;

        // Calcular mapa de acumulados por socio
        const acumuladoMap = {};
        (acumulados || []).forEach(a => {
            acumuladoMap[a.id_socio] = (acumuladoMap[a.id_socio] || 0) + parseFloat(a.monto);
        });

        // Pre-poblar grupos para asegurar que se muestren semanas sin aportes (faltantes)
        if (startDate && endDate) {
            let curr = new Date(startDate + 'T12:00:00');
            const endLimit = new Date(endDate + 'T12:00:00');
            // Si la fecha final es mayor a hoy, limitamos a hoy para no mostrar semanas futuras vacías
            const limitRef = new Date() > endLimit ? endLimit : new Date();
            limitRef.setHours(12, 0, 0, 0);

            while (curr <= endLimit) {
                const d = new Date(curr);
                const day = d.getDay();
                const diff = d.getDate() - (day === 0 ? 6 : day - 1);
                const monday = new Date(d);
                monday.setDate(diff);
                monday.setHours(12, 0, 0, 0);

                const diffMs = monday.getTime() - anchor.getTime();
                const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
                const key = `${weekNum}`;

                if (!groups[key] && weekNum > 0) {
                    const saturday = new Date(monday);
                    saturday.setDate(monday.getDate() + 5);
                    groups[key] = {
                        weekNum,
                        sub: '',
                        monday: new Date(monday),
                        label: `SEMANA ${weekNum} (SÁB ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})})`,
                        items: [],
                        sortVal: weekNum
                    };
                }
                curr.setDate(curr.getDate() + 1);
            }
        } else if (params.type === 'all') {
            // Si es reporte general, pre-poblamos desde la semana 1 hasta la actual
            const hoy = new Date();
            let curr = new Date(anchor);
            while (curr <= hoy) {
                const d = new Date(curr);
                const day = d.getDay();
                const diff = d.getDate() - (day === 0 ? 6 : day - 1);
                const monday = new Date(d);
                monday.setDate(diff);
                monday.setHours(12, 0, 0, 0);

                const diffMs = monday.getTime() - anchor.getTime();
                const weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
                const key = `${weekNum}`;

                if (!groups[key] && weekNum > 0) {
                    const saturday = new Date(monday);
                    saturday.setDate(monday.getDate() + 5);
                    groups[key] = {
                        weekNum,
                        sub: '',
                        monday: new Date(monday),
                        label: `SEMANA ${weekNum} (SÁB ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})})`,
                        items: [],
                        sortVal: weekNum
                    };
                }
                curr.setDate(curr.getDate() + 7);
            }
        }

        rawAportes.forEach(a => {
            let weekNum;
            let monday;
            
            // Si tiene una semana objetivo grabada (sub_semana es número), manda esa
            if (a.sub_semana && !isNaN(a.sub_semana)) {
                weekNum = parseInt(a.sub_semana);
                monday = new Date(anchor);
                monday.setDate(anchor.getDate() + (weekNum - 1) * 7);
            } else {
                const d = new Date(a.fecha + 'T12:00:00');
                const day = d.getDay();
                const diff = d.getDate() - (day === 0 ? 6 : day - 1);
                monday = new Date(d);
                monday.setDate(diff);
                monday.setHours(12, 0, 0, 0);

                const diffMs = monday.getTime() - anchor.getTime();
                weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
            }

            const key = `${weekNum}`;

            if (!groups[key]) {
                const saturday = new Date(monday);
                saturday.setDate(monday.getDate() + 5);
                groups[key] = {
                    weekNum,
                    monday,
                    label: `SEMANA ${weekNum} (SÁB ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})})`,
                    items: [],
                    sortVal: weekNum
                };
            }
            groups[key].items.push(a);
        });

        const sortedKeys = Object.keys(groups).sort((a, b) => groups[a].sortVal - groups[b].sortVal);
        const finalProcessedAportes = [];

        sortedKeys.forEach(key => {
            const group = groups[key];
            // Marcador de inicio de semana
            finalProcessedAportes.push({ isHeader: true, label: group.label });
            
            // AGRUPAR APORTES POR SOCIO DENTRO DE LA SEMANA (Para completar valores)
            const aportesPorSocio = {};
            group.items.forEach(item => {
                if (!aportesPorSocio[item.id_socio]) {
                    aportesPorSocio[item.id_socio] = {
                        ...item,
                        monto: parseFloat(item.monto),
                        comprobantes: [item.comprobante_url],
                        montos: [parseFloat(item.monto)],
                        fechas: [item.fecha],
                        esMerged: true
                    };
                } else {
                    aportesPorSocio[item.id_socio].monto += parseFloat(item.monto);
                    aportesPorSocio[item.id_socio].comprobantes.push(item.comprobante_url);
                    aportesPorSocio[item.id_socio].montos.push(parseFloat(item.monto));
                    aportesPorSocio[item.id_socio].fechas.push(item.fecha);
                    if (item.es_igualacion) aportesPorSocio[item.id_socio].es_igualacion = true;
                }
            });

            // Añadir socios agrupados
            Object.values(aportesPorSocio).forEach(item => finalProcessedAportes.push(item));

            // Detección de faltantes
            const sociosQueAportaron = Object.keys(aportesPorSocio);
            socioListForReport.forEach(s => {
                if (!sociosQueAportaron.includes(String(s.idsocio))) {
                    finalProcessedAportes.push({ 
                        isMissing: true, 
                        socioNombre: s.nombre,
                        fechaRef: group.monday.toISOString().split('T')[0]
                    });
                }
            });
        });

        const aportes = finalProcessedAportes;
        // --- Fin Lógica de Agrupación ---

        // 3. Generar PDF
        let yPos = 20;
        const pageHeight = 297;
        const marginBottom = 20;
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const now = new Date();
        const genDate = now.toLocaleDateString('es-EC');
        const genTime = now.toLocaleTimeString('es-EC');

        // Header
        try {
            doc.addImage(logoUrl, 'PNG', 15, 12, 18, 18);
        } catch (e) { console.warn('Logo no disponible'); }

        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50);
        doc.text("INKA CORP", 38, 18);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text("REPORTE CONSOLIDADO DE APORTES SEMANALES", 38, 24);

        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text(`Generado: ${genDate} | ${genTime}`, 148, 18);

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

        // Loop de aportes
        let totalAportadoPeriodo = 0;
        let count = 0;

        for (const aporte of aportes) {
            // Manejar encabezados de semana
            if (aporte.isHeader) {
                if (yPos + 15 > (pageHeight - marginBottom)) {
                    doc.addPage();
                    yPos = 20;
                }
                yPos += 5;
                doc.setFillColor(11, 78, 50); // Fondo Verde Oscuro Corporativo
                doc.rect(15, yPos, 180, 8, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.setTextColor(255, 255, 255); // Texto Blanco para máxima legibilidad
                doc.text(aporte.label, 20, yPos + 6);
                yPos += 12;
                continue;
            }

            // Manejar aportes faltantes
            if (aporte.isMissing) {
                if (yPos + 15 > (pageHeight - marginBottom)) {
                    doc.addPage();
                    yPos = 20;
                }
                doc.setDrawColor(239, 68, 68); // Rojo
                doc.setLineWidth(0.3);
                doc.roundedRect(15, yPos, 180, 10, 2, 2);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(239, 68, 68);
                doc.text(`FALTA APORTE: ${aporte.socioNombre}`, 22, yPos + 6.5);
                yPos += 14;
                continue;
            }

            count++;
            window.showLoader(`Procesando comprobante ${count} de ${rawAportes.length}...`);
            totalAportadoPeriodo += parseFloat(aporte.monto);

            // Ajustar altura del box si hay muchos comprobantes
            const comps = aporte.comprobante_url ? (aporte.comprobante_url.includes('|') ? aporte.comprobante_url.split('|') : [aporte.comprobante_url]) : (aporte.comprobantes || []);

            const imgSize = 48;
            const imgsPerRow = 3;
            const rows = Math.ceil(comps.length / imgsPerRow);
            const imagesAreaHeight = rows > 0 ? (rows * (imgSize + 4)) + 4 : 0;
            const textContentHeight = 40; // Altura base para el texto
            
            let boxHeight = Math.max(50, textContentHeight + imagesAreaHeight);

            if (yPos + boxHeight > (pageHeight - marginBottom)) {
                doc.addPage();
                yPos = 20;
            }

            // Box
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.5);
            doc.roundedRect(15, yPos, 180, boxHeight, 3, 3);

            let textY = yPos + 8;
            const leftMargin = 22;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(10);
            doc.setTextColor(0);
            doc.text(`APORTANTE:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            const socioNombre = aporte.socio?.nombre || 'Socio Desconocido';
            const socioLines = doc.splitTextToSize(socioNombre, 130);
            doc.text(socioLines, leftMargin + 25, textY);
            
            textY += (socioLines.length * 5) + 3;
            doc.setFont('helvetica', 'bold');
            doc.text(`FECHA:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.text(`${aporte.fecha}`, leftMargin + 25, textY);

            textY += 8;
            doc.setFont('helvetica', 'bold');
            doc.text(`MONTO:`, leftMargin, textY);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(11, 78, 50);
            
            if (aporte.esMerged && aporte.montos.length > 1) {
                doc.text(`$${parseFloat(aporte.monto).toFixed(2)} (Total)`, leftMargin + 25, textY);
                textY += 4;
                doc.setFontSize(7);
                doc.setTextColor(100);
                const desglose = aporte.montos.map((m, i) => `$${m.toFixed(2)} (${aporte.fechas[i]})`).join(' + ');
                const desgloseLines = doc.splitTextToSize(desglose, 140);
                doc.text(desgloseLines, leftMargin + 25, textY);
                textY += (desgloseLines.length * 4) + 1;
                doc.setFontSize(10);
            } else {
                doc.text(`$${parseFloat(aporte.monto).toFixed(2)}`, leftMargin + 25, textY);
                textY += 8;
            }

            if (aporte.es_igualacion) {
                doc.setFontSize(8);
                doc.setTextColor(242, 187, 58);
                doc.setFont('helvetica', 'bold');
                doc.text(`[ PAGO DE IGUALACIÓN ]`, leftMargin, textY);
                textY += 4;
            }

            // Comprobantes debajo del texto
            if (comps.length > 0 && comps[0]) {
                const imgWidth = imgSize;
                const imgHeight = imgSize;
                
                // Empezar imágenes inmediatamente después del texto
                const imagesStartY = Math.max(yPos + 38, textY + 2);

                for (let i = 0; i < comps.length; i++) {
                    const cUrl = comps[i];
                    if (!cUrl) continue;
                    
                    try {
                        const imgData = await fetchImageAsBase64Aportes(cUrl);
                        if (imgData) {
                            const xOffset = 25 + (i % imgsPerRow) * (imgSize + 5);
                            const yOffset = imagesStartY + (Math.floor(i / imgsPerRow) * (imgSize + 5));
                            
                            doc.addImage(imgData, 'JPEG', xOffset, yOffset, imgWidth, imgHeight, undefined, 'FAST');
                        }
                    } catch (e) {
                        doc.setFontSize(8);
                        doc.setTextColor(150);
                        const xErr = 25 + (i % imgsPerRow) * (imgSize + 5);
                        const yErr = imagesStartY + (Math.floor(i / imgsPerRow) * (imgSize + 5)) + 10;
                        doc.text("[Err. Imagen]", xErr, yErr);
                    }
                }
            } else {
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text("[Sin comprobante]", leftMargin, textY + 2);
            }

            yPos += boxHeight + 4;
        }

        // Resumen Final
        if (yPos + 60 > (pageHeight - marginBottom)) {
            doc.addPage();
            yPos = 20;
        }

        yPos += 5;
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(11, 78, 50);
        doc.text("RESUMEN DE APORTES", 15, yPos);

        yPos += 8;
        doc.setDrawColor(11, 78, 50);
        doc.line(15, yPos, 195, yPos);
        yPos += 10;

        // Tabla de Totales (Ahora basada en socioListForReport para incluir los que no han aportado)
        const tableData = socioListForReport.map(s => {
            const id = s.idsocio;
            const socioNombre = s.nombre;
            const periodSum = rawAportes.filter(a => String(a.id_socio) === String(id)).reduce((sum, a) => sum + parseFloat(a.monto), 0);
            const totalSum = acumuladoMap[id] || 0;
            
            // Si solo hay un socio seleccionado, omitimos la columna de acumulado (según diseño original)
            if (params.socioId !== 'ALL' && params.socioId.split(',').length === 1) {
                return [socioNombre, `$${periodSum.toFixed(2)}` ];
            }
            return [socioNombre, `$${periodSum.toFixed(2)}`, `$${totalSum.toFixed(2)}` ];
        });

        const tableHead = (params.socioId !== 'ALL' && params.socioId.split(',').length === 1)
            ? [['Socio', 'Aportado en Periodo']]
            : [['Socio', 'Aportado en Periodo', 'Total Acumulado']];

        doc.autoTable({
            startY: yPos,
            head: tableHead,
            body: tableData,
            theme: 'grid',
            headStyles: { fillColor: [11, 78, 50], textColor: [255, 255, 255] },
            columnStyles: {
                1: { halign: 'right' },
                2: { halign: 'right' }
            },
            margin: { left: 15, right: 15 }
        });

        yPos = doc.lastAutoTable.finalY + 15;
        
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(0);
        doc.text(`TOTAL DEL PERIODO SELECCIONADO:`, 15, yPos);
        doc.setTextColor(11, 78, 50);
        doc.text(`$${totalAportadoPeriodo.toFixed(2)}`, 110, yPos);

        // Solo mostrar acumulado histórico si se seleccionaron TODOS los socios
        if (params.socioId === 'ALL') {
            const totalAcumuladoGeneral = Object.values(acumuladoMap).reduce((s, v) => s + v, 0);
            yPos += 8;
            doc.setTextColor(0);
            doc.text(`TOTAL ACUMULADO HISTÓRICO:`, 15, yPos);
            doc.setTextColor(11, 78, 50);
            doc.text(`$${totalAcumuladoGeneral.toFixed(2)}`, 110, yPos);
        }

        doc.save(`Reporte_Aportes_${titlePeriod.replace(/ /g, '_')}.pdf`);
        window.disableLoader();
        Swal.fire({
            icon: 'success',
            title: 'Reporte Generado',
            text: 'El documento ha sido descargado correctamente.',
            confirmButtonColor: '#0E5936'
        });

    } catch (error) {
        console.error('Error al generar PDF:', error);
        window.disableLoader();
        Swal.fire('Error', error.message, 'error');
    }
}

/**
 * Utilidad para cargar imágenes como Base64
 */
async function fetchImageAsBase64Aportes(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (e) {
        console.error('fetchImageAsBase64 Error:', e);
        return null;
    }
}

/**
 * Prepara el modal de registro para añadir un aporte adicional a un socio y fecha específicos
 */
window.prepararAporteAdicional = async function(idSocio, fecha) {
    Swal.close();
    closeAllModals();
    
    // Al venir del historial, ya tenemos la semana objetivo bloqueada por gestionarSemana
    
    // Pequeño retardo para dejar que los modales se limpien
    await new Promise(res => setTimeout(res, 100));
    
    // No reseteamos el forcedTargetWeek aquí porque lo queremos heredar
    const _prevForced = forcedTargetWeek;
    resetFormAporte();
    forcedTargetWeek = _prevForced;
    
    // Abrir modal de aporte
    const modal = document.getElementById('modal-aporte');
    if (modal) {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
    }
    
    // Pre-llenar fecha
    const inputFecha = document.getElementById('aporte-fecha');
    if (inputFecha) inputFecha.value = fecha;
    
    // Pre-seleccionar socio
    selectAporteById(idSocio);
    
    // Setear selector manual
    llenarSelectorSemanasManual(forcedTargetWeek);
    const selectManual = document.getElementById('aporte-week-override');
    if (selectManual) selectManual.value = forcedTargetWeek || "";
    
    // La función selectAporteById ya dispara updateStatusSemana()
}

// Exponer funciones necesarias globalmente
window.initAportesModule = initAportesModule;
window.verComprobanteAporte = verComprobanteAporte;
window.gestionarSemana = gestionarSemana; // Asegurar exposición global
window.eliminarAporte = eliminarAporte; // Exponer para borrado directo

/**
 * Llena el selector de semanas manual en el modal de registro
 */
function llenarSelectorSemanasManual(defaultWeek = null) {
    const select = document.getElementById('aporte-week-override');
    if (!select) return;

    const anchor = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov
    const hoy = new Date();
    const dayHoy = hoy.getDay();
    const inicioSemanaHoy = new Date(hoy);
    inicioSemanaHoy.setDate(hoy.getDate() - (dayHoy === 0 ? 6 : dayHoy - 1));
    inicioSemanaHoy.setHours(12, 0, 0, 0);
    const maxWeek = Math.floor((inicioSemanaHoy.getTime() - anchor.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;

    let html = '<option value="">-- Autodetectar por Fecha --</option>';
    for (let i = maxWeek; i >= 1; i--) {
        const mon = new Date(anchor);
        mon.setDate(anchor.getDate() + (i - 1) * 7);
        const sat = new Date(mon);
        sat.setDate(mon.getDate() + 5);
        const satLabel = sat.toLocaleDateString('es-EC', {day:'numeric', month:'short'});
        html += `<option value="${i}">Semana ${i}${i === maxWeek ? ' (Actual)' : ''} [SÁB ${satLabel}]</option>`;
    }
    select.innerHTML = html;
}

/**
 * Abre un modal para seleccionar la semana a visualizar en el dashboard
 */
async function abrirSelectorSemanas(maxWeek) {
    const anchor = new Date(2025, 10, 17, 12, 0, 0); // Lunes 17 Nov
    const semanas = [];
    
    // Crear la lista de semanas desde la actual hasta la 1
    for (let i = maxWeek; i >= 1; i--) {
        const monday = new Date(anchor);
        monday.setDate(anchor.getDate() + (i - 1) * 7);
        const saturday = new Date(monday);
        saturday.setDate(monday.getDate() + 5);
        
        semanas.push({
            num: i,
            label: `Semana ${i}`,
            range: `SÁB ${saturday.toLocaleDateString('es-EC', {day:'numeric', month:'short'})}`
        });
    }

    await Swal.fire({
        title: 'Seleccionar Semana',
        background: '#1a1d21',
        color: '#ffffff',
        width: '450px',
        showConfirmButton: false,
        showCloseButton: true,
        html: `
            <div style="max-height: 450px; overflow-y: auto; padding-right: 5px;" id="week-scroll-container">
                <div class="week-item ${!filtroSemanaSeleccionada ? 'selected' : ''}" 
                     onclick="window.setDashboardWeekFilter(null)"
                     style="display: flex; justify-content: space-between; align-items: center; padding: 15px; margin-bottom: 10px; background: #2d3238; border-radius: 12px; cursor: pointer; border: 1px solid #3f444a; transition: all 0.2s;">
                    <div>
                        <span style="font-weight: 800; font-size: 1rem; color: #F2BB3A;">Semana Actual (Dinámica)</span>
                        <p style="margin: 3px 0 0 0; font-size: 0.8rem; color: #94a3b8;">Muestra siempre los últimos aportes</p>
                    </div>
                    ${!filtroSemanaSeleccionada ? '<i class="fas fa-check-circle" style="color: #F2BB3A;"></i>' : ''}
                </div>

                <div style="border-top: 1px solid #334155; margin: 15px 0; padding-top: 15px;">
                    <p style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 15px;">Historial de Semanas</p>
                    ${semanas.map(s => `
                        <div class="week-item ${filtroSemanaSeleccionada === s.num ? 'selected' : ''}" 
                             onclick="window.setDashboardWeekFilter(${s.num})"
                             style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; margin-bottom: 8px; background: ${filtroSemanaSeleccionada === s.num ? 'rgba(242, 187, 58, 0.1)' : '#1e293b'}; border-radius: 10px; cursor: pointer; border: 1px solid ${filtroSemanaSeleccionada === s.num ? '#F2BB3A' : '#334155'}; transition: all 0.2s;">
                            <div>
                                <span style="font-weight: 700; color: #fff;">${s.label}</span>
                                <p style="margin: 2px 0 0 0; font-size: 0.75rem; color: #94a3b8;">${s.range}</p>
                            </div>
                            <i class="fas fa-chevron-right" style="font-size: 0.7rem; color: #475569;"></i>
                        </div>
                    `).join('')}
                </div>
            </div>
            <style>
                .week-item:hover { background: #334155 !important; transform: translateX(5px); border-color: #475569; }
                .week-item.selected { border-color: #F2BB3A !important; }
                #week-scroll-container::-webkit-scrollbar { width: 4px; }
                #week-scroll-container::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            </style>
        `
    });
}

// Helper para activar el filtro y cerrar el modal
window.setDashboardWeekFilter = (weekNum) => {
    filtroSemanaSeleccionada = weekNum;
    Swal.close();
    renderAportesRecientes(aportesData);
};
