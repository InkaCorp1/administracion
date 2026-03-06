/**
 * Módulo de Aportes Móvil (Versión Lite Optimizada)
 */

let liteAportesData = [];
let currentMonthFilter = new Date().getMonth() + 1; // 1-12
let currentYearFilter = new Date().getFullYear();

// NUEVO: Estado del filtro global
let currentFilterMode = 'month'; // 'month' | 'socio'
let selectedSocio = null; // { id, nombre }

async function initAportesModule() {
    console.log("Iniciando Módulo Aportes Lite...");
    
    // Configurar etiqueta de mes inicial
    updateFilterLabel();
    
    // Evento para el filtro (Ahora abre el modal con opciones)
    const btnMes = document.getElementById("btn-filtro-mes");
    if (btnMes) {
        btnMes.addEventListener("click", openLiteFilterModal);
    }
    
    await fetchAportesMobile();
}

// Exponer globalmente
window.initAportesModule = initAportesModule;

/**
 * Actualiza la etiqueta del botón de filtro basándose en el modo actual
 */
function updateFilterLabel() {
    const label = document.getElementById("lite-label-mes");
    const headerTitle = document.getElementById("header-title-text");
    if (!label) return;

    if (currentFilterMode === 'month') {
        const meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
        label.textContent = `${meses[currentMonthFilter - 1]} ${currentYearFilter}`;
        if (headerTitle) headerTitle.textContent = "Mis Aportes";
    } else if (selectedSocio) {
        label.textContent = reorderSocioName(selectedSocio.nombre);
        if (headerTitle) headerTitle.textContent = reorderSocioName(selectedSocio.nombre);
    }
}

/**
 * Modal principal de filtrado con "Slider" (Toggle) para cambiar entre Fecha y Socio
 */
async function openLiteFilterModal() {
    const mesesFull = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const today = new Date();
    
    // 1. Cabecera con Segmented Control (Slider)
    const renderHeader = () => `
        <div class="lite-filter-slider">
            <div class="lite-filter-option ${currentFilterMode === 'month' ? 'active' : ''}" onclick="window.switchLiteFilterMode('month')">POR FECHA</div>
            <div class="lite-filter-option ${currentFilterMode === 'socio' ? 'active' : ''}" onclick="window.switchLiteFilterMode('socio')">POR SOCIO</div>
        </div>
    `;

    // 2. Contenido de Fecha (Grid de Meses)
    const renderDateGrid = () => {
        let html = '<div class="lite-months-grid animate__animated animate__fadeIn animate__faster">';
        for (let i = 0; i < 12; i++) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
            const m = d.getMonth() + 1;
            const y = d.getFullYear();
            const isActive = (m === currentMonthFilter && y === currentYearFilter && currentFilterMode === 'month') ? "is-active" : "";
            html += `
                <div class="month-option ${isActive}" onclick="window.setLiteMonthFilter(${m}, ${y})">
                    <span>${mesesFull[m-1]}</span>
                    <span>${y}</span>
                </div>
            `;
        }
        html += '</div>';
        return html;
    };

    // 3. Contenido de Socio (Solo lista de socios activos)
    const renderSocioSearch = () => `
        <div id="lite-socio-filter-view" class="lite-socio-search-container animate__animated animate__fadeIn animate__faster">
            <div class="lite-socio-list" id="lite-socio-list-results">
                <div style="padding: 3rem; text-align: center;">
                    <div class="loading-spinner" style="width: 25px; height: 25px;"></div>
                    <p style="color: #94a3b8; font-size: 0.7rem; margin-top: 1rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;">Identificando socios activos...</p>
                </div>
            </div>
        </div>
    `;

    // Funciones globales temporales para interactuar con el modal
    window.switchLiteFilterMode = (mode) => {
        currentFilterMode = mode;
        const container = document.getElementById('lite-modal-content-area');
        const slider = document.querySelector('.lite-filter-slider');
        
        // Actualizar UI del slider
        if (slider) {
            slider.querySelectorAll('.lite-filter-option').forEach(opt => {
                opt.classList.toggle('active', opt.textContent.includes(mode === 'month' ? 'FECHA' : 'SOCIO'));
            });
        }

        // Cambiar vista
        if (container) {
            container.innerHTML = mode === 'month' ? renderDateGrid() : renderSocioSearch();
            if (mode === 'socio') {
                window.loadLiteActiveSocios();
            }
        }
    };

    window.setLiteMonthFilter = (m, y) => {
        currentMonthFilter = m;
        currentYearFilter = y;
        currentFilterMode = 'month';
        selectedSocio = null;
        Swal.clickConfirm();
    };

    window.setLiteSocioFilter = (id, nombre) => {
        selectedSocio = { id, nombre };
        currentFilterMode = 'socio';
        Swal.clickConfirm();
    };

    /**
     * Carga solo socios que tengan al menos un aporte registrado
     */
    window.loadLiteActiveSocios = async () => {
        const listDiv = document.getElementById('lite-socio-list-results');
        try {
            const supabase = window.getSupabaseClient();
            
            // Paso 1: Obtener IDs únicos de socios con aportes
            const { data: activeData, error: activeErr } = await supabase
                .from('ic_aportes_semanales')
                .select('id_socio');
            
            if (activeErr) throw activeErr;
            
            // Filtrar IDs únicos
            const uniqueIds = [...new Set(activeData.map(item => item.id_socio))];

            if (uniqueIds.length === 0) {
                listDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: #94a3b8;">No hay aportes registrados</div>';
                return;
            }

            // Paso 2: Obtener detalles de esos socios
            const { data: socios, error: socioErr } = await supabase
                .from('ic_socios')
                .select('idsocio, nombre')
                .in('idsocio', uniqueIds)
                .order('nombre');

            if (socioErr) throw socioErr;

            if (socios.length === 0) {
                listDiv.innerHTML = '<div style="padding: 2rem; text-align: center; color: #94a3b8;">No se encontró información de socios</div>';
                return;
            }

            listDiv.innerHTML = socios.map(s => {
                const initial = s.nombre.charAt(0).toUpperCase();
                const displayName = reorderSocioName(s.nombre);
                return `
                    <div class="lite-socio-option" onclick="window.setLiteSocioFilter('${s.idsocio}', '${s.nombre.replace(/'/g, "\\'")}')">
                        <div class="socio-initial">${initial}</div>
                        <div class="socio-info">
                            <div class="socio-name">${displayName}</div>
                            <div class="socio-meta"><i class="fas fa-history"></i> VER HISTORIAL COMPLETO</div>
                        </div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error("Error cargando socios activos:", e);
            if (listDiv) listDiv.innerHTML = '<div style="padding: 1rem; color: #ef4444; font-size: 0.75rem;">Error al identificar socios activos</div>';
        }
    };

    const result = await Swal.fire({
        title: 'Filtrar Historial',
        html: `
            ${renderHeader()}
            <div id="lite-modal-content-area">
                ${currentFilterMode === 'month' ? renderDateGrid() : renderSocioSearch()}
            </div>
        `,
        showConfirmButton: false,
        showCancelButton: true,
        cancelButtonText: 'Cerrar',
        customClass: {
            popup: 'lite-swal-popup',
            title: 'lite-swal-title',
            cancelButton: 'lite-swal-cancel'
        },
        background: '#111827',
        didOpen: () => {
            if (currentFilterMode === 'socio') window.loadLiteActiveSocios();
        }
    });

    if (result.isConfirmed) {
        updateFilterLabel();
        await fetchAportesMobile();
    }
}

/**
 * Obtiene los aportes de Supabase filtrados por mes O por socio
 */
async function fetchAportesMobile() {
    const listContainer = document.getElementById("lite-aportes-list");
    const totalDisplay = document.getElementById("lite-total-aportes");

    if (listContainer) {
        listContainer.innerHTML = `
            <div style="padding: 3rem 0; text-align: center;">
                <div class="loading-spinner"></div>
                <p style="color: var(--text-secondary); margin-top: 1rem; font-size: 0.8rem;">Actualizando historial...</p>
            </div>
        `;
    }

    try {
        const supabase = window.getSupabaseClient();
        if (!supabase) return;

        let query = supabase.from("ic_aportes_semanales").select("*, socio:ic_socios!id_socio(nombre)");

        if (currentFilterMode === 'month') {
            const startDate = `${currentYearFilter}-${String(currentMonthFilter).padStart(2, '0')}-01`;
            const lastDay = new Date(currentYearFilter, currentMonthFilter, 0).getDate();
            const endDate = `${currentYearFilter}-${String(currentMonthFilter).padStart(2, '0')}-${lastDay}`;
            query = query.gte("fecha", startDate).lte("fecha", endDate);
        } else if (selectedSocio) {
            if (selectedSocio.id && selectedSocio.id !== "null") {
                query = query.eq("id_socio", selectedSocio.id);
            } else {
                // Si no hay ID, filtramos a través de la relación de socio.nombre (ilike)
                query = query.filter("socio.nombre", "ilike", `%${selectedSocio.nombre}%`);
            }
        }

        const { data, error } = await query.order("fecha", { ascending: false });

        if (error) throw error;

        liteAportesData = data || [];
        renderLiteAportes(liteAportesData);

        // Calcular totales
        const total = liteAportesData.reduce((sum, item) => sum + parseFloat(item.monto || 0), 0);
        if (totalDisplay) totalDisplay.textContent = `$${total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

    } catch (err) {
        console.error("Error al cargar aportes móvil:", err);
        if (listContainer) {
            listContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: #ef4444;">Error de conexión</div>`;
        }
    }
}

/**
 * Formatea el nombre del socio: Palabras 3 y 4 primero, luego 1 y 2
 */
function reorderSocioName(fullName) {
    if (!fullName) return "SOCIO DESCONOCIDO";
    const parts = fullName.trim().split(/\s+/);
    
    // Si tiene al menos 4 palabras (Apellido1 Apellido2 Nombre1 Nombre2)
    if (parts.length >= 4) {
        const p1 = parts[0] || "";
        const p2 = parts[1] || "";
        const p3 = parts[2] || "";
        const p4 = parts[3] || "";
        const rest = parts.slice(4).join(" ");
        return `${p3} ${p4} ${p1} ${p2} ${rest}`.trim().toUpperCase();
    }
    
    return fullName.toUpperCase();
}

/**
 * Renderiza la lista de aportes
 */
function renderLiteAportes(data) {
    const container = document.getElementById("lite-aportes-list");
    if (!container) return;

    if (data.length === 0) {
        container.innerHTML = `
            <div style="padding: 3rem 1rem; text-align: center; color: var(--text-secondary);">
                <i class="fas fa-calendar-times" style="font-size: 2rem; margin-bottom: 1rem; opacity: 0.3;"></i>
                <p>No se encontraron aportes en este periodo.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = data.map((item, idx) => {
        const rawFecha = item.fecha;
        const fecha = new Date(rawFecha.includes('T') ? rawFecha : rawFecha + "T12:00:00");
        const dia = fecha.getDate();
        const mes = fecha.toLocaleString("es-ES", { month: "short" }).toUpperCase().replace(".", "");
        
        const socioNombreOriginal = item.socio ? item.socio.nombre : "Socio Desconocido";
        const socioNombreFormateado = reorderSocioName(socioNombreOriginal);

        return `
            <div class="lite-aporte-item" onclick="verComprobanteAporte(${idx})" 
                 style="display: flex; align-items: center; padding: 1.15rem 1rem; border-bottom: 1px solid rgba(255,255,255,0.03); gap: 1rem; cursor: pointer;">
                
                <div class="date-badge" style="background: rgba(255,255,255,0.03); min-width: 48px; height: 48px; border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; line-height: 1.1; border: 1px solid rgba(255,255,255,0.05);">
                    <span style="font-size: 0.6rem; font-weight: 800; color: #94a3b8; letter-spacing: 0.5px;">${mes}</span>
                    <span style="font-size: 1.2rem; font-weight: 900; color: #f8fafc;">${dia}</span>
                </div>

                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 800; color: #f8fafc; font-size: 0.825rem; letter-spacing: 0.3px; margin-bottom: 0.2rem; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                        ${socioNombreFormateado}
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-size: 0.65rem; font-weight: 700; color: #94a3b8; background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 5px;">
                            ${item.es_igualacion ? "IGUALACIÓN" : "SEMANAL"}
                        </span>
                        ${item.sub_semana ? `<span style="font-size: 0.65rem; font-weight: 500; color: #64748b;">• GRP ${item.sub_semana}</span>` : ""}
                    </div>
                </div>

                <div style="text-align: right; min-width: 80px;">
                    <div style="font-weight: 900; color: #10b981; font-size: 1.05rem; letter-spacing: -0.5px;">
                        +$${parseFloat(item.monto).toFixed(2)}
                    </div>
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-top: 0.2rem;">
                        <i class="fas fa-check-circle" style="font-size: 0.6rem; color: #fbbf24;"></i>
                        <span style="font-size: 0.65rem; font-weight: 800; color: #fbbf24; letter-spacing: 0.5px;">ACREDITADO</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

/**
 * Muestra el comprobante del aporte seleccionado
 */
function verComprobanteAporte(idx) {
    const aporte = liteAportesData[idx];
    if (!aporte) return;

    if (!aporte.comprobante_url) {
        Swal.fire({
            icon: 'info',
            title: 'Sin comprobante',
            text: 'Este aporte no tiene una imagen adjunta.',
            confirmButtonColor: '#fbbf24',
            customClass: {
                popup: 'lite-swal-popup'
            }
        });
        return;
    }

    const socioNombre = aporte.socio ? reorderSocioName(aporte.socio.nombre) : "Socio Desconocido";

    Swal.fire({
        title: `<div style="font-size: 0.85rem; font-weight: 800; color: white; text-transform: uppercase;">${socioNombre}</div>`,
        html: `
            <div style="margin-top: 0.5rem; border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1); background: #000; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                <img src="${aporte.comprobante_url}" style="width: 100%; height: auto; display: block; max-height: 60vh; object-fit: contain;">
            </div>
            <div style="margin-top: 1.25rem; display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; background: rgba(0,0,0,0.2); border-radius: 10px;">
                <div style="text-align: left;">
                    <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Monto</div>
                    <div style="font-size: 1.25rem; font-weight: 800; color: #10b981;">$${parseFloat(aporte.monto).toFixed(2)}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Acreditado</div>
                    <div style="font-size: 0.9rem; font-weight: 800; color: #e2e8f0;">${new Date(aporte.fecha+"T12:00:00").toLocaleDateString('es-ES', { day:'numeric', month:'short' })}</div>
                </div>
            </div>
        `,
        showCloseButton: true,
        showConfirmButton: false,
        width: '90%',
        background: '#111827',
        showClass: { popup: 'animate__animated animate__zoomIn animate__faster' },
        hideClass: { popup: 'animate__animated animate__zoomOut animate__faster' }
    });
}
