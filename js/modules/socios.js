/**
 * INKA CORP - Módulo de Socios
 * Gestión de socios con tarjetas elegantes
 */

// ==========================================
// ESTADO DEL MÓDULO
// ==========================================
let allSocios = [];
let filteredSocios = [];
let currentSocioFilter = 'todos';
let currentPaisFilterSocios = '';
let currentSearchTerm = '';
let currentSociosFilterMode = 'categoria'; // 'categoria' | 'pais'
let currentSocioDetails = null;

const ESTADOS_CREDITO_VIGENTE = ['ACTIVO', 'MOROSO', 'PAUSADO'];

// ==========================================
// CACHÉ DE FOTOS DE PERFIL
// ==========================================
const FOTO_CACHE_KEY = 'inkacorp_fotos_cache';
const FOTO_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas

function getFotosCache() {
    try {
        const cached = localStorage.getItem(FOTO_CACHE_KEY);
        if (!cached) return {};
        return JSON.parse(cached);
    } catch (e) {
        return {};
    }
}

function setFotoCache(idsocio, fotoUrl) {
    try {
        const cache = getFotosCache();
        cache[idsocio] = {
            url: fotoUrl,
            timestamp: Date.now()
        };
        localStorage.setItem(FOTO_CACHE_KEY, JSON.stringify(cache));
    } catch (e) {
        console.warn('Error cacheando foto:', e);
    }
}

function getCachedFoto(idsocio) {
    const cache = getFotosCache();
    const entry = cache[idsocio];
    if (!entry) return null;

    // Verificar si expiró
    if (Date.now() - entry.timestamp > FOTO_CACHE_DURATION) {
        return null;
    }
    return entry.url;
}

// Mapeo de países a banderas

// Mapeo de países a banderas
const PAIS_CONFIG_SOCIOS = {
    'ECUADOR': { code: 'EC', flag: 'https://flagcdn.com/w20/ec.png' },
    'ESTADOS UNIDOS': { code: 'US', flag: 'https://flagcdn.com/w20/us.png' },
    'USA': { code: 'US', flag: 'https://flagcdn.com/w20/us.png' },
    'PERÚ': { code: 'PE', flag: 'https://flagcdn.com/w20/pe.png' },
    'PERU': { code: 'PE', flag: 'https://flagcdn.com/w20/pe.png' }
};

function normalizePaisSocios(pais) {
    if (!pais) return '';
    const raw = String(pais).toUpperCase().trim();

    // Normalizar a los valores exactos requeridos (MAYYUSCULAS Y TILDES)
    if (raw === 'ECUADOR') return 'ECUADOR';
    if (raw === 'ESTADOS UNIDOS' || raw === 'USA' || raw === 'UNITED STATES' || raw === 'UNITED STATES OF AMERICA') return 'ESTADOS UNIDOS';
    if (raw === 'PERÚ' || raw === 'PERU' || raw.includes('PERU')) return 'PERÚ';

    // Generar normalizado genérico para otros
    return raw
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function setSociosFilterMode(mode) {
    currentSociosFilterMode = mode;

    // En este flujo, no deshabilitamos: solo limpiamos la UI del grupo opuesto
    if (mode === 'categoria') {
        document.querySelectorAll('.pais-filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    } else {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
    }
}

// ==========================================
// INICIALIZACIÓN
// ==========================================
async function initSociosModule() {
    // Si la vista de Socios aún no está montada, no inicializar.
    // Esto evita errores cuando el archivo se carga globalmente desde index.html.
    const sociosGrid = document.getElementById('socios-grid');
    if (!sociosGrid) {
        console.warn('Vista de Socios no encontrada en el DOM. Se omite initSociosModule().');
        return;
    }

    // Exponer funciones globalmente
    window.filterSocios = filterSocios;
    window.filterSociosByPais = filterSociosByPais;
    window.searchSocios = searchSocios;
    window.refreshSocios = refreshSocios;
    window.showSocioDetails = showSocioDetails;

    setSociosFilterMode('categoria');
    await loadSocios();

    // Verificar si venimos desde el dashboard para abrir un socio específico
    const showId = sessionStorage.getItem('showSocioDetails');
    if (showId) {
        sessionStorage.removeItem('showSocioDetails');
        if (typeof showSocioDetails === 'function') showSocioDetails(showId);
    }
}

// ==========================================
// CARGAR DATOS (Patrón: Caché Instantáneo + Actualización en Segundo Plano)
// ==========================================
async function loadSocios(forceRefresh = false) {
    try {
        const sociosGrid = document.getElementById('socios-grid');

        // PASO 1: Mostrar datos de caché INMEDIATAMENTE si existen
        if (!forceRefresh && window.hasCacheData && window.hasCacheData('socios')) {
            const sociosFromCache = window.getCacheData('socios');

            // Verificar si el caché tiene el nuevo campo 'amortizacion' necesario para la mora
            // Buscamos algún socio que tenga créditos para verificar si tienen la propiedad amortizacion
            const needsRefresh = sociosFromCache.some(s =>
                s.creditos && s.creditos.length > 0 && s.creditos.some(c => c.amortizacion === undefined)
            );

            processSociosData(sociosFromCache);

            // Si el caché es reciente y tiene todos los campos, no recargar
            if (!needsRefresh && window.isCacheValid && window.isCacheValid('socios')) {
                return;
            }
        } else {
            // Solo mostrar loading si no hay caché o es refresh forzado
            if (sociosGrid) {
                sociosGrid.innerHTML = '<div class="loading-placeholder"><i class="fas fa-spinner fa-spin"></i><span>Cargando socios...</span></div>';
            }
        }

        // PASO 2: Actualizar en segundo plano
        const supabase = window.getSupabaseClient();

        const { data: socios, error } = await supabase
            .from('ic_socios')
            .select(`
                *,
                creditos:ic_creditos (
                    id_credito,
                    codigo_credito,
                    estado_credito,
                    capital,
                    plazo,
                    dia_pago,
                    cuota_con_ahorro,
                    cuotas_pagadas,
                    amortizacion:ic_creditos_amortizacion (
                        fecha_vencimiento,
                        estado_cuota
                    )
                )
            `)
            .order('nombre', { ascending: true });

        if (error) throw error;

        // Guardar en caché
        if (window.setCacheData) {
            window.setCacheData('socios', socios);
        }

        // Procesar y mostrar datos actualizados
        processSociosData(socios);

    } catch (error) {
        console.error('Error cargando socios:', error);
        // Si hay error pero tenemos caché, mantener los datos de caché
        if (!window.hasCacheData || !window.hasCacheData('socios')) {
            showSociosError('Error al cargar socios');
        }
    }
}

// Procesar datos de socios (desde caché o BD)
function processSociosData(socios) {
    const hoy = parseDate(todayISODate());

    allSocios = (socios || []).map(socio => {
        const creditosVigentes = socio.creditos?.filter(c =>
            ESTADOS_CREDITO_VIGENTE.includes((c.estado_credito || '').toUpperCase())
        ) || [];

        const tieneMora = socio.creditos?.some(c => (c.estado_credito || '').toUpperCase() === 'MOROSO') || false;
        const tieneActivo = socio.creditos?.some(c => (c.estado_credito || '').toUpperCase() === 'ACTIVO') || false;
        const tienePausado = socio.creditos?.some(c => (c.estado_credito || '').toUpperCase() === 'PAUSADO') || false;

        const creditoEstado = tieneMora
            ? 'MOROSO'
            : (tieneActivo ? 'ACTIVO' : (tienePausado ? 'PAUSADO' : 'SIN_CREDITO'));

        const tieneCredito = creditoEstado !== 'SIN_CREDITO';

        // Calcular días de mora máximos
        let diasMoraMax = 0;
        if (tieneMora) {
            socio.creditos?.forEach(credito => {
                if (!credito.amortizacion) return;
                credito.amortizacion.forEach(cuota => {
                    if (cuota.estado_cuota === 'VENCIDO') {
                        const fechaVenc = parseDate(cuota.fecha_vencimiento);
                        if (!fechaVenc) return;

                        // Ambos están en UTC-5 (Ecuador) a las 00:00:00
                        const diffTime = hoy.getTime() - fechaVenc.getTime();
                        const dias = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

                        if (dias > diasMoraMax) diasMoraMax = dias;
                    }
                });
            });
        }

        return {
            ...socio,
            tieneCredito,
            tieneMora,
            tienePausado,
            creditoEstado,
            totalCreditos: socio.creditos?.length || 0,
            creditosVigentes: creditosVigentes.length,
            diasMora: diasMoraMax
        };
    });

    filteredSocios = [...allSocios];
    updateSociosStats();
    applyFilters();
}

function showSociosError(message) {
    const container = document.getElementById('socios-grid');
    if (container) {
        container.innerHTML = '<div class="error-state"><i class="fas fa-exclamation-triangle"></i><p>' + message + '</p><button class="btn btn-secondary" onclick="loadSocios()"><i class="fas fa-redo"></i> Reintentar</button></div>';
    }
}

// ==========================================
// ESTADÍSTICAS
// ==========================================
function updateSociosStats() {
    const total = allSocios.length;
    const conCreditos = allSocios.filter(s => s.tieneCredito).length;
    const sinCreditos = allSocios.filter(s => !s.tieneCredito).length;
    const morosos = allSocios.filter(s => s.tieneMora).length;

    const elTotal = document.getElementById('stat-total-socios');
    const elCon = document.getElementById('stat-con-creditos');
    const elSin = document.getElementById('stat-sin-creditos');
    const elMorosos = document.getElementById('stat-morosos');

    if (elTotal) elTotal.textContent = total;
    if (elCon) elCon.textContent = conCreditos;
    if (elSin) elSin.textContent = sinCreditos;
    if (elMorosos) elMorosos.textContent = morosos;
}

// ==========================================
// FILTROS
// ==========================================
function filterSocios(filter) {
    // Activar modo de filtros (naranjas)
    currentSocioFilter = filter;
    currentPaisFilterSocios = '';
    setSociosFilterMode('categoria');

    // Actualizar botones activos
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // Despintar países/🌎
    document.querySelectorAll('.pais-filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    applyFilters();
}

function filterSociosByPais(pais) {
    const normalized = normalizePaisSocios(pais);

    // Activar modo país (automático)
    currentPaisFilterSocios = normalized;
    currentSocioFilter = 'todos';
    setSociosFilterMode('pais');

    // Actualizar botones activos
    document.querySelectorAll('.pais-filter-btn').forEach(btn => {
        const btnPais = normalizePaisSocios(btn.dataset.pais || '');
        btn.classList.toggle('active', btnPais === normalized);
    });

    // Despintar filtros naranjas
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    applyFilters();
}

function searchSocios(term) {
    currentSearchTerm = term.toLowerCase().trim();
    applyFilters();
}

function applyFilters() {
    filteredSocios = allSocios.filter(socio => {
        // Filtro por estado (solo en modo categoría)
        if (currentSociosFilterMode === 'categoria') {
            if (currentSocioFilter === 'con-credito' && !socio.tieneCredito) return false;
            if (currentSocioFilter === 'sin-credito' && socio.tieneCredito) return false;
            if (currentSocioFilter === 'moroso' && !socio.tieneMora) return false;
        }

        // Filtro por país (solo en modo país)
        if (currentSociosFilterMode === 'pais' && currentPaisFilterSocios) {
            const paisSocio = normalizePaisSocios(socio.paisresidencia);
            if (!paisSocio.includes(currentPaisFilterSocios)) return false;
        }

        // Filtro por búsqueda
        if (currentSearchTerm) {
            const nombre = (socio.nombre || '').toLowerCase();
            const cedula = (socio.cedula || '').toLowerCase();
            if (!nombre.includes(currentSearchTerm) && !cedula.includes(currentSearchTerm)) {
                return false;
            }
        }

        return true;
    });

    renderSocios();
}

// ==========================================
// RENDERIZADO
// ==========================================
function renderSocios() {
    const grid = document.getElementById('socios-grid');
    if (!grid) return;

    if (filteredSocios.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-users-slash"></i>
                <p>No se encontraron socios</p>
            </div>
        `;
        return;
    }

    const activos = filteredSocios.filter(s => s.creditoEstado === 'ACTIVO');
    // Ordenar morosos por días de mora (más moroso primero) y luego por país
    const morosos = filteredSocios
        .filter(s => s.creditoEstado === 'MOROSO')
        .sort((a, b) => {
            // Primero por país
            const paisA = (a.paisresidencia || '').toLowerCase();
            const paisB = (b.paisresidencia || '').toLowerCase();
            if (paisA !== paisB) return paisA.localeCompare(paisB);
            // Luego por días de mora (mayor primero)
            return (b.diasMora || 0) - (a.diasMora || 0);
        });
    const pausados = filteredSocios.filter(s => s.creditoEstado === 'PAUSADO');
    const sinCredito = filteredSocios.filter(s => s.creditoEstado === 'SIN_CREDITO');

    // Función para renderizar morosos agrupados por país
    const renderMorososByPais = (morososList) => {
        if (!morososList || morososList.length === 0) return '';

        // Agrupar por país
        const porPais = {};
        morososList.forEach(s => {
            const pais = (s.paisresidencia || 'Sin país').toUpperCase();
            if (!porPais[pais]) porPais[pais] = [];
            porPais[pais].push(s);
        });

        // Ordenar países por el socio con más días de mora
        const paisesOrdenados = Object.keys(porPais).sort((a, b) => {
            const maxA = Math.max(...porPais[a].map(s => s.diasMora || 0));
            const maxB = Math.max(...porPais[b].map(s => s.diasMora || 0));
            return maxB - maxA;
        });

        // Ordenar socios dentro de cada país por días de mora
        paisesOrdenados.forEach(pais => {
            porPais[pais].sort((a, b) => (b.diasMora || 0) - (a.diasMora || 0));
        });

        const getPaisFlag = (pais) => {
            const paisLower = pais.toLowerCase();
            const flags = {
                'ecuador': 'https://flagcdn.com/w20/ec.png',
                'colombia': 'https://flagcdn.com/w20/co.png',
                'peru': 'https://flagcdn.com/w20/pe.png',
                'perú': 'https://flagcdn.com/w20/pe.png',
                'venezuela': 'https://flagcdn.com/w20/ve.png',
                'estados unidos': 'https://flagcdn.com/w20/us.png',
                'usa': 'https://flagcdn.com/w20/us.png',
                'españa': 'https://flagcdn.com/w20/es.png'
            };
            return flags[paisLower] || '';
        };

        return paisesOrdenados.map(pais => {
            const flagUrl = getPaisFlag(pais);
            const flagImg = flagUrl ? `<img src="${flagUrl}" alt="" class="pais-flag-mini" style="width:18px;height:12px;margin-right:6px;">` : '';
            return `
                <div class="morosos-pais-section">
                    <div class="morosos-pais-title">
                        ${flagImg}
                        <span>${pais}</span>
                        <span class="morosos-pais-count">${porPais[pais].length}</span>
                    </div>
                    <div class="socios-grid">
                        ${porPais[pais].map(s => createSocioCard(s)).join('')}
                    </div>
                </div>
            `;
        }).join('');
    };

    const renderSubsection = (title, variant, socios) => {
        if (!socios || socios.length === 0) return '';
        return `
            <div class="socios-subsection">
                <div class="socios-subsection-title ${variant}">
                    <span class="dot"></span>
                    <span>${title}</span>
                </div>
                <div class="socios-grid">
                    ${socios.map(s => createSocioCard(s)).join('')}
                </div>
            </div>
        `;
    };

    const conCreditoHtml = (activos.length || morosos.length || pausados.length)
        ? `
            <section class="socios-section">
                <div class="socios-section-header">
                    <div class="socios-section-title">Socios con crédito</div>
                </div>
                <div class="socios-subsections">
                    ${morosos.length ? `
                        <div class="socios-subsection">
                            <div class="socios-subsection-title moroso">
                                <span class="dot"></span>
                                <span>Morosos</span>
                            </div>
                            ${renderMorososByPais(morosos)}
                        </div>
                    ` : ''}
                    ${renderSubsection('Activos', 'activo', activos)}
                    ${renderSubsection('Pausados', 'pausado', pausados)}
                </div>
            </section>
        `
        : '';

    const sinCreditoHtml = sinCredito.length
        ? `
            <section class="socios-section">
                <div class="socios-section-header">
                    <div class="socios-section-title">Socios sin crédito</div>
                </div>
                <div class="socios-grid">
                    ${sinCredito.map(s => createSocioCard(s)).join('')}
                </div>
            </section>
        `
        : '';

    grid.innerHTML = conCreditoHtml + sinCreditoHtml;
}

function createSocioCard(socio) {
    const initials = getInitials(socio.nombre);
    const paisFlag = getPaisFlagSocios(socio.paisresidencia);
    const statusBadge = getStatusBadge(socio);

    // Obtener foto de caché para el avatar
    const cachedFoto = getCachedFoto(socio.idsocio);
    const fotoUrl = cachedFoto || socio.fotoidentidad;

    const esMoroso = socio.creditoEstado === 'MOROSO' && socio.diasMora > 0;

    const avatarClass = socio.creditoEstado === 'MOROSO'
        ? 'moroso'
        : (socio.creditoEstado === 'ACTIVO' ? 'activo' : (socio.creditoEstado === 'PAUSADO' ? 'pausado' : ''));

    // Contenido del avatar: Imagen si existe, si no alerta de actualización
    const avatarContent = fotoUrl 
        ? `<img src="${fotoUrl}" alt="Avatar" class="socio-avatar-img" onerror="this.onerror=null; let p=this.parentElement; if(p){ p.classList.add('photo-error'); p.removeAttribute('style'); setTimeout(() => { if(p) p.innerHTML='<i class=&quot;fas fa-exclamation-triangle&quot;></i><span class=&quot;avatar-error-text&quot;>ACTUALIZAR</span>' }, 0); }">`
        : `<i class="fas fa-exclamation-circle"></i><span class="avatar-error-text">ACTUALIZAR</span>`;

    // Formatear nombre: 2 o 3 palabras arriba, el resto abajo (máximo 2 filas)
    const nombreCompleto = (socio.nombre || 'Sin nombre').trim();
    const palabras = nombreCompleto.split(/\s+/);
    let nombreRender = nombreCompleto;
    
    if (palabras.length > 4) {
        // Si tiene más de 4 palabras, 3 arriba y el resto abajo
        const linea1 = palabras.slice(0, 3).join(' ');
        const linea2 = palabras.slice(3).join(' ');
        nombreRender = `${linea1}<br>${linea2}`;
    } else if (palabras.length > 2) {
        // Si tiene 3 o 4 palabras, 2 arriba y el resto abajo
        const linea1 = palabras.slice(0, 2).join(' ');
        const linea2 = palabras.slice(2).join(' ');
        nombreRender = `${linea1}<br>${linea2}`;
    }

    const cardStatusClass = esMoroso ? 'socio-card-moroso' : (avatarClass ? `socio-card-${avatarClass}` : 'socio-card-sin-credito');

    return `
        <div class="socio-card ${cardStatusClass}" onclick="showSocioDetails('${socio.idsocio}')">
            <div class="socio-card-header">
                <div class="socio-avatar ${avatarClass} ${fotoUrl ? 'has-photo' : 'photo-error'}">
                    ${avatarContent}
                </div>
                <div class="socio-header-status">
                    ${statusBadge}
                </div>
            </div>
            <div class="socio-card-body">
                <h3 class="socio-nombre">${nombreRender}</h3>
                <p class="socio-cedula">
                    <i class="fas fa-id-card"></i>
                    ${socio.cedula || 'Sin cédula'}
                    ${paisFlag ? `<img src="${paisFlag}" alt="" class="socio-flag-inline">` : ''}
                </p>
            </div>
            <div class="socio-card-footer">
                <span class="socio-creditos">
                    <i class="fas fa-hand-holding-usd"></i>
                    ${socio.creditosVigentes === 0 
                        ? 'Sin créditos vigentes' 
                        : (socio.creditosVigentes === 1 
                            ? '1 crédito vigente' 
                            : `${socio.creditosVigentes} créditos vigentes`)}
                </span>
                <span class="socio-vigentes-pill" title="Créditos vigentes">${socio.creditosVigentes || 0}</span>
            </div>
        </div>
    `;
}

function getInitials(nombre) {
    if (!nombre) return '?';
    return nombre.split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}

function getPaisFlagSocios(pais) {
    if (!pais) return '';
    const normalized = normalizePaisSocios(pais);
    const config = PAIS_CONFIG_SOCIOS[normalized];
    return config ? config.flag : '';
}

function getStatusBadge(socio) {
    if (socio.creditoEstado === 'MOROSO') {
        const diasMora = socio.diasMora || 0;
        // Ya no usamos inline styles agresivos, dejamos que el CSS maneje la estética cápsula
        return `<span class="socio-badge moroso">MOROSO - ${diasMora} DÍAS</span>`;
    }
    if (socio.creditoEstado === 'ACTIVO') {
        return '<span class="socio-badge activo">ACTIVO</span>';
    }
    if (socio.creditoEstado === 'PAUSADO') {
        return '<span class="socio-badge pausado">PAUSADO</span>';
    }
    return '<span class="socio-badge sin-credito">SIN CRÉDITO</span>';
}

// ==========================================
// MODAL DE DETALLES
// ==========================================
function showSocioDetails(idsocio) {
    const socio = allSocios.find(s => s.idsocio === idsocio);
    if (!socio) return;

    currentSocioDetails = socio; // Guardar socio actual para exportación

    const modal = document.getElementById('modal-socio-detalle');
    const modalNombre = document.getElementById('modal-socio-nombre');
    const modalBody = document.getElementById('modal-socio-body');
    const btnFicha = document.getElementById('btn-descargar-ficha');
    const btnEdit = document.getElementById('btn-edit-socio');

    if (!modal || !modalNombre || !modalBody) return;

    modalNombre.textContent = socio.nombre || 'Socio';

    // Configurar botones del header
    if (btnFicha) {
        btnFicha.onclick = () => generarFichaSocioPDF(socio);
    }
    
    if (btnEdit) {
        btnEdit.onclick = () => {
            // Guardar socio actual en sessionStorage para persistencia
            sessionStorage.setItem('edit_socio_id', socio.idsocio);
            closeModal();
            if (typeof window.loadView === 'function') {
                window.loadView('socios_edit');
            }
        };
    }

    const paisFlag = getPaisFlagSocios(socio.paisresidencia);
    const paisNombre = socio.paisresidencia ? socio.paisresidencia.toUpperCase() : '-';

    // Determinar badge de estado
    let estadoBadge = '';
    if (socio.esMoroso) {
        estadoBadge = '<span class="socio-status-badge moroso"><i class="fas fa-exclamation-triangle"></i> Moroso</span>';
    } else if (socio.totalCreditos > 0) {
        estadoBadge = '<span class="socio-status-badge activo"><i class="fas fa-check-circle"></i> Con Crédito</span>';
    } else {
        estadoBadge = '<span class="socio-status-badge sin-credito"><i class="fas fa-clock"></i> Sin Crédito</span>';
    }

    // Obtener foto de caché o usar placeholder
    const cachedFoto = getCachedFoto(idsocio);
    const fotoUrl = cachedFoto || socio.fotoidentidad || null;
    const fotoId = 'socio-foto-' + idsocio;

    modalBody.innerHTML = `
        <!-- Header con foto de perfil y info básica - NUEVO DISEÑO -->
        <div class="socio-modal-hero">
            <div class="socio-hero-photo" id="${fotoId}">
                ${fotoUrl ?
            '<img src="' + fotoUrl + '" alt="Foto" class="socio-photo-img" onerror="this.parentElement.innerHTML=\'' + getInitials(socio.nombre) + '\'">' :
            getInitials(socio.nombre)
        }
            </div>
            <div class="socio-hero-gradient"></div>
            <div class="socio-hero-info">
                <div class="socio-hero-cedula">
                    <i class="fas fa-id-card"></i> ${socio.cedula || '-'}
                </div>
                <div class="socio-hero-pais">
                    ${paisFlag ? '<img src="' + paisFlag + '" class="modal-flag">' : ''}
                    <span>${paisNombre}</span>
                </div>
                ${estadoBadge}
            </div>
        </div>

        <!-- Grid de información -->
        <div class="socio-modal-grid">
            <!-- Columna izquierda -->
            <div class="socio-modal-column">
                <!-- Datos Personales -->
                <div class="modal-info-card">
                    <div class="modal-card-header">
                        <i class="fas fa-user-circle"></i>
                        <span>Datos Personales</span>
                    </div>
                    <div class="modal-card-content">
                        <div class="modal-info-row">
                            <span class="info-label">Domicilio</span>
                            <span class="info-value">${socio.domicilio || 'No registrado'}</span>
                        </div>
                        <div class="modal-info-row">
                            <span class="info-label">Estado Civil</span>
                            <span class="info-value">${socio.estadocivil || '-'}</span>
                        </div>
                    </div>
                </div>

                <!-- Referencia -->
                <div class="modal-info-card">
                    <div class="modal-card-header">
                        <i class="fas fa-user-friends"></i>
                        <span>Referencia</span>
                    </div>
                    <div class="modal-card-content">
                        <div class="modal-info-row">
                            <span class="info-label">Nombre</span>
                            <span class="info-value">${socio.nombrereferencia || 'No registrado'}</span>
                        </div>
                        <div class="modal-info-row">
                            <span class="info-label">Teléfono</span>
                            <span class="info-value">
                                ${socio.whatsappreferencia ? `
                                    <a href="https://wa.me/${String(socio.whatsappreferencia).replace(/\D/g, '')}" target="_blank" class="whatsapp-btn-mini">
                                        <i class="fab fa-whatsapp"></i> ${socio.whatsappreferencia}
                                    </a>
                                ` : '-'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Columna derecha -->
            <div class="socio-modal-column">
                <!-- Contacto -->
                <div class="modal-info-card highlight">
                    <div class="modal-card-header">
                        <i class="fas fa-phone-alt"></i>
                        <span>Contacto</span>
                    </div>
                    <div class="modal-card-content">
                        ${socio.whatsapp ? `
                            <a href="https://wa.me/${String(socio.whatsapp).replace(/\D/g, '')}" target="_blank" class="whatsapp-btn-large">
                                <i class="fab fa-whatsapp"></i>
                                <span>${socio.whatsapp}</span>
                            </a>
                        ` : '<span class="no-data-text">Sin WhatsApp registrado</span>'}
                    </div>
                </div>

                <!-- Cónyuge -->
                <div class="modal-info-card ${socio.nombreconyuge && socio.nombreconyuge !== 'NO APLICA' ? '' : 'muted'}">
                    <div class="modal-card-header">
                        <i class="fas fa-heart"></i>
                        <span>Cónyuge</span>
                    </div>
                    <div class="modal-card-content">
                        ${socio.nombreconyuge && socio.nombreconyuge !== 'NO APLICA' ? `
                            <div class="modal-info-row">
                                <span class="info-label">Nombre</span>
                                <span class="info-value">${socio.nombreconyuge}</span>
                            </div>
                            <div class="modal-info-row">
                                <span class="info-label">Cédula</span>
                                <span class="info-value">${socio.cedulaconyuge || '-'}</span>
                            </div>
                            <div class="modal-info-row">
                                <span class="info-label">Teléfono</span>
                                <span class="info-value">
                                    ${socio.whatsappconyuge && socio.whatsappconyuge !== 'NO APLICA' ? `
                                        <a href="https://wa.me/${String(socio.whatsappconyuge).replace(/\D/g, '')}" target="_blank" class="whatsapp-btn-mini">
                                            <i class="fab fa-whatsapp"></i> ${socio.whatsappconyuge}
                                        </a>
                                    ` : '-'}
                                </span>
                            </div>
                        ` : '<span class="no-data-text">No aplica / Soltero(a)</span>'}
                    </div>
                </div>
            </div>
        </div>

        <!-- Sección de Documentos -->
        <div class="modal-docs-section">
            <div class="modal-section-header">
                <div class="section-title-group">
                    <i class="fas fa-camera-retro"></i>
                    <span>Documentos Digitales</span>
                </div>
            </div>
            <div class="modal-docs-grid">
                ${(() => {
                    const estadoCivilRaw = socio.estadocivil || 'No registrado';
                    const estadoCivilLCase = estadoCivilRaw.toLowerCase();
                    const noAplicaConyuge = ['soltero', 'soltera', 'divorciado', 'divorciada', 'viudo', 'viuda', 'no aplica'].some(s => estadoCivilLCase.includes(s));
                    
                    const docs = [
                        { id: 'identidad', label: 'Cédula', url: socio.fotoidentidad },
                        { id: 'domicilio', label: 'Domicilio', url: socio.fotodomicilio },
                        { id: 'bien', label: 'Garantía', url: socio.fotobien },
                        { id: 'firma', label: 'Firma', url: socio.fotofirma },
                        { id: 'conyuge', label: 'Cédula Cónyuge', url: socio.fotodocumentoconyuge, isConyuge: true }
                    ];

                    return docs.map(doc => {
                        const isNA = doc.isConyuge && noAplicaConyuge;
                        const hasUrl = doc.url && doc.url !== '';
                        
                        return `
                            <div class="modal-doc-item">
                                <span class="doc-label">${doc.label}</span>
                                <div class="doc-container ${isNA ? 'doc-no-aplica' : ''}">
                                    ${isNA ? `
                                        <div class="doc-placeholder">
                                            <i class="fas fa-user-slash"></i>
                                            <span>N/A</span>
                                        </div>
                                        <div class="doc-status-tag na">SOLTERO(A)</div>
                                    ` : (hasUrl ? `
                                        <img src="${doc.url}" alt="${doc.label}" class="doc-img" 
                                             onclick="window.open('${doc.url}', '_blank')"
                                             onerror="this.style.display='none'; this.parentElement.classList.add('doc-corrupto');">
                                        <div class="doc-placeholder corrupto-msg" style="display:none">
                                            <i class="fas fa-sync-alt" style="color: #ef4444"></i>
                                            <span>Actualizar Imagen</span>
                                        </div>
                                        <button class="doc-update-btn" onclick="openImageUpdater('${socio.idsocio}', '${doc.id}')">
                                            <i class="fas fa-sync-alt"></i>
                                            <span>Actualizar</span>
                                        </button>
                                    ` : `
                                        <div class="doc-placeholder">
                                            <i class="fas fa-image"></i>
                                            <span>Sin Imagen</span>
                                        </div>
                                        <button class="doc-update-btn" style="opacity:1" onclick="openImageUpdater('${socio.idsocio}', '${doc.id}')">
                                            <i class="fas fa-plus"></i>
                                            <span>Actualizar</span>
                                        </button>
                                        <div class="doc-status-tag missing">FALTANTE</div>
                                    `)}
                                </div>
                            </div>
                        `;
                    }).join('');
                })()}
            </div>
        </div>

        <!-- Sección de Créditos -->
        <div class="modal-creditos-section">
            <div class="modal-section-header">
                <div class="section-title-group">
                    <i class="fas fa-hand-holding-usd"></i>
                    <span>Historial de Créditos</span>
                </div>
                <span class="creditos-count">${socio.totalCreditos || 0}</span>
            </div>
            <div class="modal-creditos-list">
                ${(() => {
                    if (!socio.creditos || socio.creditos.length === 0) {
                        return `
                            <div class="no-creditos">
                                <i class="fas fa-folder-open"></i>
                                <span>Este socio no tiene créditos registrados</span>
                            </div>
                        `;
                    }

                    // Definir prioridades para el ordenamiento
                    const statusPriority = {
                        'MOROSO': 1,
                        'ACTIVO': 2,
                        'PAUSADO': 3,
                        'PENDIENTE': 4
                    };

                    // Ordenar créditos por estado
                    const sortedCreditos = [...socio.creditos].sort((a, b) => {
                        const prioA = statusPriority[a.estado_credito?.toUpperCase()] || 99;
                        const prioB = statusPriority[b.estado_credito?.toUpperCase()] || 99;
                        return prioA - prioB;
                    });

                    return sortedCreditos.map(c => `
                        <div class="credito-card ${c.estado_credito.toLowerCase()}" onclick="navigateToCredito('${c.id_credito}')">
                            <div class="credito-card-left">
                                <div class="credito-indicator"></div>
                                <div class="credito-main-info">
                                    <div class="credito-header-row">
                                        <span class="credito-codigo">${c.codigo_credito || c.id_credito.substring(0, 8)}</span>
                                        <span class="credito-estado-badge ${c.estado_credito.toLowerCase()}">${c.estado_credito}</span>
                                    </div>
                                    <div class="credito-data-grid">
                                        <div class="credito-data-item">
                                            <span class="data-label">Cuotas</span>
                                            <span class="data-value">${c.cuotas_pagadas || 0}/${c.plazo || '-'}</span>
                                        </div>
                                        <div class="credito-data-item">
                                            <span class="data-label">Pago</span>
                                            <span class="data-value">$${parseFloat(c.cuota_con_ahorro || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div class="credito-data-item">
                                            <span class="data-label">Día</span>
                                            <span class="data-value">${c.dia_pago || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="credito-card-right">
                                <div class="credito-capital-group">
                                    <span class="capital-label">CAPITAL</span>
                                    <span class="credito-monto">$${parseFloat(c.capital || 0).toLocaleString('es-EC', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <i class="fas fa-chevron-right"></i>
                            </div>
                        </div>
                    `).join('');
                })()}
            </div>
        </div>
    `;

    // Mostrar modal
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Resetear scroll al inicio
    modalBody.scrollTop = 0;

    // Cargar foto si no está en caché
    if (!cachedFoto && socio.fotoidentidad) {
        // Cachear la foto para uso futuro
        setFotoCache(idsocio, socio.fotoidentidad);
    } else if (!cachedFoto && !socio.fotoidentidad) {
        // Intentar cargar foto desde la base de datos si no está disponible
        loadSocioFoto(idsocio, fotoId);
    }

    const closeModal = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    // Cerrar modal
    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.onclick = closeModal;
    });
}

// Cargar foto del socio desde la BD
async function loadSocioFoto(idsocio, containerId) {
    try {
        const supabase = window.getSupabaseClient();
        const { data, error } = await supabase
            .from('ic_socios')
            .select('fotoidentidad')
            .eq('idsocio', idsocio)
            .single();

        if (error || !data || !data.fotoidentidad) return;

        // Cachear la foto
        setFotoCache(idsocio, data.fotoidentidad);

        // Actualizar el contenedor si existe
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = '<img src="' + data.fotoidentidad + '" alt="Foto" class="socio-photo-img">';
        }
    } catch (e) {
        console.warn('Error cargando foto del socio:', e);
    }
}

// Abrir el editor de socio desde el modal de detalles
function openImageUpdater(idsocio, fieldId) {
    const socio = allSocios.find(s => s.idsocio === idsocio);
    if (!socio) return;

    // Guardar socio actual para edición
    sessionStorage.setItem('edit_socio_id', idsocio);
    
    // Cerrar el modal actual
    const modal = document.getElementById('modal-socio-detalle');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }

    // Cargar la vista de edición
    if (typeof window.loadView === 'function') {
        window.loadView('socios_edit');
        
        // Un pequeño delay para que cargue la vista y podamos hacer scroll al campo si fuera necesario
        // En una implementación más avanzada, podríamos pasar el fieldId para enfocar el input
        showToast(`Cargando editor para actualizar ${fieldId}...`, 'info');
    }
}

// Función auxiliar para obtener iniciales
function getInitials(nombre) {
    if (!nombre) return '??';
    const parts = nombre.trim().split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return nombre.substring(0, 2).toUpperCase();
}

// ==========================================
// UTILIDADES
// ==========================================
async function refreshSocios() {
    const btn = document.getElementById('btn-sync-socios');
    btn?.classList.add('spinning');

    await loadSocios(true); // Forzar actualización ignorando caché

    setTimeout(() => btn?.classList.remove('spinning'), 500);
    showToast('Socios actualizados', 'success');
}

function showSociosError(message) {
    const grid = document.getElementById('socios-grid');
    if (!grid) return;
    grid.innerHTML = `
        <div class="error-state">
            <i class="fas fa-exclamation-triangle"></i>
            <p>${message}</p>
            <button onclick="refreshSocios()" class="btn btn-primary">Reintentar</button>
        </div>
    `;
}

/**
 * Genera la Ficha Completa del Socio en PDF con imágenes
 */
async function generarFichaSocioPDF(socio) {
    if (!socio) return;

    const btnFicha = document.getElementById('btn-descargar-ficha');
    if (btnFicha) {
        btnFicha.disabled = true;
        btnFicha.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // Configuración de página
        const pageWidth = 210;
        const pageHeight = 297;
        const margin = 20;
        const contentWidth = pageWidth - (margin * 2);

        // Colores corporativos (basados en solicitud_credito.js)
        const colors = {
            primary: [14, 89, 54],      // #0E5936
            secondary: [22, 115, 54],   // #167336
            tertiary: [17, 76, 89],     // #114C59
            contrast1: [191, 75, 33],   // #BF4B21
            contrast2: [242, 177, 56],  // #F2B138
            textDark: [51, 51, 51],     // #333
            lightGray: [240, 240, 240]  // #f0f0f0
        };

        // Función para cargar imagen
        const loadImage = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => resolve(img);
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        const loadImageAsBase64 = (url) => {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                };
                img.onerror = () => resolve(null);
                img.src = url;
            });
        };

        // Cargar logo
        showToast('Generando ficha, cargando documentos...', 'info');
        const logoImg = await loadImage('https://lh3.googleusercontent.com/d/15J6Aj6ZwkVrmDfs6uyVk-oG0Mqr-i9Jn=w2048?name=inka%20corp%20normal.png');

        // --- HEADER ---
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, pageWidth, 40, 'F');
        doc.setFillColor(...colors.primary);
        doc.rect(0, 0, pageWidth, 2, 'F');

        if (logoImg) doc.addImage(logoImg, 'PNG', 15, 6, 28, 28);

        doc.setTextColor(...colors.primary);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text('FICHA INTEGRAL DEL SOCIO', 55, 22);

        doc.setTextColor(100, 100, 100);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Identificación: ${socio.idsocio}`, 55, 31);

        doc.setDrawColor(...colors.contrast2);
        doc.setLineWidth(1.5);
        doc.line(margin, 45, pageWidth - margin, 45);

        let y = 55;

        // Normalización de Estado Civil
        const estadoCivilRaw = socio.estadocivil || 'No registrado';
        const estadoCivilLCase = estadoCivilRaw.toLowerCase();
        const noAplicaConyuge = ['soltero', 'soltera', 'divorciado', 'divorciada', 'viudo', 'viuda'].some(s => estadoCivilLCase.includes(s));

        // --- SECCIÓN 1: DATOS PERSONALES ---
        doc.setFillColor(...colors.primary);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('DATOS PERSONALES Y RESIDENCIA', margin + 3, y + 5.5);
        y += 12;

        const personalFields = [
            ['Nombre Completo', (socio.nombre || 'No registrado').toUpperCase()],
            ['Cédula/ID', socio.cedula || 'No registrado'],
            ['Domicilio', socio.domicilio || 'No registrado'],
            ['WhatsApp', socio.whatsapp || 'No registrado'],
            ['País de Residencia', socio.paisresidencia || 'No registrado'],
            ['Estado Civil', estadoCivilRaw.toUpperCase()]
        ];

        doc.setTextColor(...colors.textDark);
        personalFields.forEach((field, i) => {
            if (i % 2 === 0) {
                doc.setFillColor(...colors.lightGray);
                doc.rect(margin, y - 4, contentWidth, 6, 'F');
            }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`${field[0]}:`, margin + 3, y);
            doc.setFont('helvetica', 'normal');
            doc.text(String(field[1]), margin + 55, y);
            y += 6;
        });

        y += 5;

        // --- SECCIÓN 2: INFORMACIÓN FAMILIAR Y REFERENCIAS ---
        doc.setFillColor(...colors.secondary);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('INFORMACIÓN FAMILIAR Y REFERENCIAS', margin + 3, y + 5.5);
        y += 12;

        const familyFields = [
            ...(noAplicaConyuge ? 
                [['Cónyuge/Pareja', `NO APLICA POR ESTADO CIVIL (${estadoCivilRaw.toUpperCase()})`]] : 
                [
                    ['Nombre del Cónyuge', socio.nombreconyuge || 'No registrado'],
                    ['Cédula Cónyuge', socio.cedulaconyuge || 'No registrado'],
                    ['WhatsApp Cónyuge', socio.whatsappconyuge || 'No registrado']
                ]
            ),
            ['Referencia Personal', socio.nombrereferencia || 'No registrado'],
            ['WhatsApp Referencia', socio.whatsappreferencia || 'No registrado']
        ];

        doc.setTextColor(...colors.textDark);
        familyFields.forEach((field, i) => {
            if (i % 2 === 0) {
                doc.setFillColor(...colors.lightGray);
                doc.rect(margin, y - 4, contentWidth, 6, 'F');
            }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`${field[0]}:`, margin + 3, y);
            doc.setFont('helvetica', 'normal');
            doc.text(String(field[1]), margin + 55, y);
            y += 6;
        });

        y += 5;

        // --- SECCIÓN 3: RESUMEN DE CRÉDITOS ---
        doc.setFillColor(...colors.tertiary);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('HISTORIAL Y ESTADO DE CRÉDITOS', margin + 3, y + 5.5);
        y += 12;

        const summaryFields = [
            ['Estado Actual', socio.creditoEstado],
            ['Total Créditos', String(socio.totalCreditos)],
            ['Créditos Vigentes', String(socio.creditosVigentes)],
            ['Días de Mora Máximos', `${socio.diasMora || 0} días`]
        ];

        doc.setTextColor(...colors.textDark);
        summaryFields.forEach((field, i) => {
            if (i % 2 === 0) {
                doc.setFillColor(...colors.lightGray);
                doc.rect(margin, y - 4, contentWidth, 6, 'F');
            }
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.text(`${field[0]}:`, margin + 3, y);
            doc.setFont('helvetica', 'normal');
            doc.text(String(field[1]), margin + 55, y);
            y += 6;
        });

        y += 10;

        // --- DOCUMENTOS ADJUNTOS (IMÁGENES - 2 COLUMNAS) ---
        const docs = [
            { url: socio.fotoidentidad, title: 'Cédula de Identidad' },
            { url: socio.fotodomicilio, title: 'Comprobante de Domicilio' },
            { url: socio.fotobien, title: 'Bien en Garantía' },
            { url: socio.fotofirma, title: 'Firma Registrada' },
            { url: socio.fotodocumentoconyuge, title: 'Cédula del Cónyuge', type: 'conyuge' }
        ].filter(d => d.url || d.type === 'conyuge'); // Forzamos que aparezca la del cónyuge para validar

        if (docs.length > 0) {
            doc.addPage();
            y = 20;

            const sectionTitle = 'DOCUMENTOS Y RESPALDOS DIGITALES';
            doc.setFillColor(...colors.primary);
            doc.rect(margin, y, contentWidth, 8, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(sectionTitle, margin + 3, y + 5.5);
            y += 15;

            const colWidth = (contentWidth - 10) / 2;
            const leftX = margin;
            const rightX = margin + colWidth + 10;
            let currentLeftY = y;
            let currentRightY = y;

            for (let i = 0; i < docs.length; i++) {
                const item = docs[i];
                const isLeft = i % 2 === 0;
                const x = isLeft ? leftX : rightX;
                let currentY = isLeft ? currentLeftY : currentRightY;

                // Caso especial: Cónyuge no aplica por estado civil
                if (item.type === 'conyuge' && noAplicaConyuge) {
                    if (currentY + 55 > pageHeight - 40) {
                        doc.addPage();
                        currentLeftY = currentRightY = currentY = 20;
                    }
                    doc.setTextColor(...colors.primary);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.text(item.title, x, currentY);

                    const placeholderH = 35;
                    doc.setDrawColor(...colors.tertiary); // Azul/Verde oscuro corporativo
                    doc.setLineWidth(0.3);
                    doc.roundedRect(x, currentY + 3, colWidth, placeholderH, 2, 2, 'D');
                    
                    doc.setTextColor(...colors.tertiary);
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.text('NO APLICA', x + (colWidth / 2), currentY + 18, { align: 'center' });
                    
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'italic');
                    doc.text(`(Estado civil: ${estadoCivilRaw.toUpperCase()})`, x + (colWidth / 2), currentY + 23, { align: 'center' });
                    
                    if (isLeft) currentLeftY += placeholderH + 15;
                    else currentRightY += placeholderH + 15;
                    continue;
                }

                const img64 = await loadImageAsBase64(item.url);
                let success = false;
                let finalImgH = 40; // Altura base para el placeholder

                if (img64) {
                    // Obtener dimensiones reales para mantener proporción
                    const imgInfo = await new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve({ w: img.width, h: img.height });
                        img.onerror = () => resolve({ w: 800, h: 600 });
                        img.src = img64;
                    });

                    let imgH = (colWidth * imgInfo.h) / imgInfo.w;
                    const maxImgH = 80; 
                    if (imgH > maxImgH) imgH = maxImgH;
                    
                    finalImgH = imgH;

                    // Control de salto de página antes de intentar añadir
                    if (currentY + finalImgH + 15 > pageHeight - 40) {
                        doc.addPage();
                        currentLeftY = currentRightY = currentY = 20;
                    }

                    doc.setTextColor(...colors.primary);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.text(item.title, x, currentY);

                    try {
                        doc.addImage(img64, 'JPEG', x, currentY + 3, colWidth, finalImgH);
                        success = true;
                    } catch (e) {
                        console.error('Error insertando imagen:', e);
                        success = false;
                    }
                } else {
                    // Si loadImageAsBase64 devolvió null, recalculamos salto para el placeholder
                    if (currentY + 55 > pageHeight - 40) {
                        doc.addPage();
                        currentLeftY = currentRightY = currentY = 20;
                    }
                    doc.setTextColor(...colors.primary);
                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'bold');
                    doc.text(item.title, x, currentY);
                }

                if (!success) {
                    // Diseño "Elegante" para error de imagen
                    const placeholderH = 35;
                    doc.setDrawColor(220, 53, 69); // Rojo suave 
                    doc.setLineWidth(0.3);
                    // Dibujar rectángulo redondeado
                    doc.roundedRect(x, currentY + 3, colWidth, placeholderH, 2, 2, 'D');
                    
                    doc.setTextColor(220, 53, 69);
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.text('ACTUALIZA ESTA IMAGEN', x + (colWidth / 2), currentY + 18, { align: 'center' });
                    
                    doc.setFontSize(7);
                    doc.setFont('helvetica', 'italic');
                    doc.text('(Documento no disponible o corrupto)', x + (colWidth / 2), currentY + 23, { align: 'center' });
                    
                    finalImgH = placeholderH;
                }

                // Actualizar el Y de la columna correspondiente
                if (isLeft) currentLeftY += finalImgH + 15;
                else currentRightY += finalImgH + 15;
            }
            y = Math.max(currentLeftY, currentRightY) + 10;
        }

        // --- FIRMA ELECTRÓNICA Y QR ---
        const footerNeededSpace = 60; // Espacio para Título, QR y texto
        if (y + footerNeededSpace > pageHeight) {
            doc.addPage();
            y = 20;
        } else {
            // Si hay espacio, lo ponemos un poco más abajo del final del contenido
            y = Math.max(y, pageHeight - 75);
        }

        doc.setFillColor(...colors.contrast1);
        doc.rect(margin, y, contentWidth, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('CERTIFICACIÓN DE FICHA', margin + 3, y + 5.5);
        y += 15;

        // QR de Validación
        const qrData = `SOCIO: ${socio.nombre}\nID: ${socio.idsocio}\nESTADO: ${socio.creditoEstado}\nVERIFICADO: ${new Date().toLocaleString()}`;
        const qr = new QRious({ value: qrData, size: 200, foreground: '#0E5936' });
        doc.addImage(qr.toDataURL(), 'PNG', (pageWidth/2) - 15, y, 30, 30);
        
        y += 35;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text('Esta ficha ha sido generada automáticamente por el sistema INKA CORP.', pageWidth/2, y, { align: 'center' });
        doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, pageWidth/2, y + 4, { align: 'center' });

        doc.save(`FICHA_SOCIO_${socio.idsocio}.pdf`);
        showToast('Ficha descargada con éxito', 'success');

    } catch (error) {
        console.error('Error generando ficha:', error);
        showToast('Error al generar la ficha del socio', 'error');
    } finally {
        if (btnFicha) {
            btnFicha.disabled = false;
            btnFicha.innerHTML = '<i class="fas fa-file-pdf"></i> <span>Ficha del Socio</span>';
        }
    }
}

/**
 * Abre el modal de configuración de exportación
 */
function openExportSociosModal() {
    const modal = document.getElementById('modal-export-socios');
    if (!modal) return;

    // Reiniciar selectores a "todos" por defecto o al país actual
    const selectors = modal.querySelectorAll('.export-selector-group');
    selectors.forEach(group => {
        const buttons = group.querySelectorAll('.export-selector-btn');
        buttons.forEach(btn => {
            btn.classList.remove('active');
            
            // Si es el grupo de país, seleccionar el país actual si existe
            if (group.id === 'export-selector-pais' && currentPaisFilterSocios) {
                if (btn.dataset.value === currentPaisFilterSocios) btn.classList.add('active');
            } else if (btn.dataset.value === 'todos') {
                // Para otros grupos, por defecto es "todos"
                if (!currentPaisFilterSocios || group.id !== 'export-selector-pais') {
                    btn.classList.add('active');
                }
            }

            // Añadir evento click si no lo tiene
            btn.onclick = (e) => {
                buttons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            };
        });
    });

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Configurar cierre
    const closeModal = () => {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    };

    modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.onclick = closeModal;
    });
}

/**
 * Cierra el modal de exportación
 */
function closeExportSociosModal() {
    const modal = document.getElementById('modal-export-socios');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.body.style.overflow = '';
}

/**
 * Procesa la exportación basada en los filtros del modal
 */
async function processSociosExport() {
    // Obtener valores de los selectores (botones activos)
    const getActiveValue = (groupId) => {
        return document.querySelector(`#${groupId} .export-selector-btn.active`)?.dataset.value || 'todos';
    };

    const statusFilter = getActiveValue('export-selector-status');
    const paisFilter = getActiveValue('export-selector-pais');
    const moraFilter = getActiveValue('export-selector-mora');

    // Filtrar la lista completa de socios según los criterios del modal
    let listToExport = allSocios.filter(socio => {
        // Filtro de Estado (Créditos)
        if (statusFilter === 'con_credito' && !socio.tieneCredito) return false;
        if (statusFilter === 'sin_credito' && socio.tieneCredito) return false;

        // Filtro de País
        if (paisFilter !== 'todos') {
            const paisSocio = normalizePaisSocios(socio.paisresidencia);
            if (!paisSocio.includes(paisFilter)) return false;
        }

        // Filtro de Mora
        if (moraFilter === 'morosos' && !socio.tieneMora) return false;
        if (moraFilter === 'puntuales' && (socio.tieneMora || !socio.tieneCredito)) return false;

        return true;
    });

    if (listToExport.length === 0) {
        showToast('No hay socios que coincidan con estos filtros', 'warning');
        return;
    }

    // Cerrar modal y proceder a generar PDF
    closeExportSociosModal();
    generateSociosPDF(listToExport, { statusFilter, paisFilter, moraFilter });
}

/**
 * Genera el PDF con los datos filtrados
 */
async function generateSociosPDF(data, filters) {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        // Configuración de encabezado
        const logoUrl = 'https://i.ibb.co/3mC22Hc4/inka-corp.png';
        const now = new Date();
        const dateStr = now.toLocaleDateString('es-EC');
        const timeStr = now.toLocaleTimeString('es-EC');

        // Intentar agregar logo
        try {
            doc.addImage(logoUrl, 'PNG', 15, 10, 20, 20);
        } catch (e) {
            console.warn('No se pudo cargar el logo para el PDF');
        }

        // Título del reporte
        doc.setFontSize(18);
        doc.setTextColor(11, 78, 50); // Color verde INKA
        doc.text('INKA CORP', 40, 18);
        
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text('REPORTE PERSONALIZADO DE SOCIOS', 40, 25);
        
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Fecha: ${dateStr} ${timeStr}`, 145, 18);
        doc.text(`Total en reporte: ${data.length}`, 145, 23);

        // Mostrar filtros aplicados en el PDF
        doc.setFontSize(8);
        doc.setTextColor(11, 78, 50);
        let filterText = 'Filtros: ';
        filterText += `Estado: ${filters.statusFilter.toUpperCase()} | `;
        filterText += `País: ${filters.paisFilter.toUpperCase()} | `;
        filterText += `Mora: ${filters.moraFilter.toUpperCase()}`;
        doc.text(filterText, 15, 33);

        doc.setDrawColor(11, 78, 50);
        doc.line(15, 35, 195, 35);

        // Tabla de socios
        const tableData = data.map((socio, index) => [
            index + 1,
            socio.nombre?.toUpperCase() || 'N/A',
            socio.cedula || 'N/A',
            socio.paisresidencia?.toUpperCase() || 'N/A',
            socio.creditoEstado === 'MOROSO' ? `MOROSO (${socio.diasMora}d)` : socio.creditoEstado,
            socio.whatsapp || '-'
        ]);

        doc.autoTable({
            startY: 40,
            head: [['#', 'NOMBRE', 'CÉDULA', 'PAÍS RESIDENCIA', 'ESTADO', 'WHATSAPP']],
            body: tableData,
            styles: { fontSize: 7, cellPadding: 2 },
            headStyles: { 
                fillColor: [11, 78, 50], 
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 8 },
                2: { halign: 'center', cellWidth: 25 },
                3: { halign: 'center', cellWidth: 30 },
                4: { halign: 'center', cellWidth: 25 },
                5: { halign: 'center', cellWidth: 25 }
            },
            alternateRowStyles: { fillColor: [245, 245, 245] },
            margin: { left: 15, right: 15 },
            didDrawPage: function (data) {
                // Pie de página
                doc.setFontSize(8);
                doc.setTextColor(150);
                doc.text(
                    'Página ' + doc.internal.getNumberOfPages(),
                    data.settings.margin.left,
                    doc.internal.pageSize.getHeight() - 10
                );
            }
        });

        // Guardar PDF
        doc.save(`INKA_REPORT_SOCIOS_${now.getTime()}.pdf`);
        showToast('PDF generado correctamente', 'success');

    } catch (error) {
        console.error('Error al generar PDF:', error);
        showToast('Error al generar el PDF', 'error');
    }
}

// Exponer funciones globales
window.openExportSociosModal = openExportSociosModal;
window.closeExportSociosModal = closeExportSociosModal;
window.processSociosExport = processSociosExport;
window.initSociosModule = initSociosModule;
